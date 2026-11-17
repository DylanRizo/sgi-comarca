import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SessionService } from '../src/auth/application/session.service.js';
import { CsrfTokenService } from '../src/auth/http/csrf-token.service.js';
import { createApplication } from '../src/bootstrap.js';
import { InventoryTransferService } from '../src/inventory/inventory-transfer.service.js';
import { runBootstrap } from '../../../packages/database/src/bootstrap/run-bootstrap.js';

const sharedDatabaseUrl = process.env.DATABASE_URL;
if (!sharedDatabaseUrl) {
  throw new Error('Integration database setup did not provide DATABASE_URL.');
}

const execFileAsync = promisify(execFile);
const host = 'localhost:3001';
const origin = 'http://localhost:3000';
const DAY_MS = 24 * 60 * 60 * 1000;

function quoteDatabaseName(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(value)) throw new Error('Unsafe name.');
  return `"${value}"`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function migrateDatabase(databaseUrl: string): Promise<void> {
  const databaseRoot = fileURLToPath(
    new URL('../../../packages/database/', import.meta.url),
  );
  await execFileAsync(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          '../../../packages/database/node_modules/prisma/build/index.js',
          import.meta.url,
        ),
      ),
      'migrate',
      'deploy',
      '--config',
      fileURLToPath(
        new URL('../../../packages/database/prisma.config.ts', import.meta.url),
      ),
    ],
    {
      cwd: databaseRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      maxBuffer: 1024 * 1024,
    },
  );
}

describe.sequential('Read-only integration keys and catalog', () => {
  let administrator!: DatabaseClient;
  let client!: DatabaseClient;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let databaseName = '';
  let cookie = '';
  let csrfToken = '';
  let userId = '';
  const originalEnvironment = { ...process.env };

  const createKey = (
    name = 'Bot de prueba',
    expiresInDays = 30,
    marketplaceBotInstanceKey?: string,
  ) =>
    request(app.getHttpServer())
      .post('/api/v1/integrations/keys')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ expiresInDays, name, marketplaceBotInstanceKey });

  const readCatalog = (secret: string, query = '?pageSize=100') =>
    request(app.getHttpServer())
      .get(`/api/v1/integrations/catalog${query}`)
      .set('Host', host)
      .set('Authorization', `Bearer ${secret}`);

  const denyOwnerPermission = async (code: string): Promise<string> => {
    const permission = await client.permission.findUniqueOrThrow({
      where: { code },
    });
    const deny = await client.userPermission.create({
      data: { effect: 'DENY', permissionId: permission.id, userId },
    });
    return deny.id;
  };

  beforeAll(async () => {
    const source = new URL(sharedDatabaseUrl);
    databaseName =
      'sgi_integration_keys_' +
      process.pid.toString() +
      '_' +
      randomUUID().replaceAll('-', '').slice(0, 12);
    const administratorUrl = new URL(source);
    administratorUrl.pathname = '/postgres';
    administratorUrl.searchParams.delete('schema');
    const isolatedUrl = new URL(source);
    isolatedUrl.pathname = `/${databaseName}`;
    isolatedUrl.searchParams.set('schema', 'public');

    administrator = createDatabaseClient(administratorUrl.toString());
    await administrator.$executeRawUnsafe(
      `CREATE DATABASE ${quoteDatabaseName(databaseName)}`,
    );
    await migrateDatabase(isolatedUrl.toString());
    process.env.DATABASE_URL = isolatedUrl.toString();
    process.env.AUTH_ORIGIN_HMAC_SECRET_BASE64 = Buffer.alloc(
      32,
      0x51,
    ).toString('base64');
    process.env.AUTH_CSRF_HMAC_SECRET_BASE64 = Buffer.alloc(32, 0x52).toString(
      'base64',
    );
    process.env.INTEGRATION_KEYS_ENABLED = 'true';
    process.env.MARKETPLACE_BOT_CONTROL_ENABLED = 'true';

    client = createDatabaseClient(isolatedUrl.toString());
    await runBootstrap(client);
    const user = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'dylan' },
      select: { id: true },
    });
    userId = user.id;
    // The password predates every key the suite issues, so a key is only ever
    // rejected for the reason each test sets up.
    const activatedAt = new Date(Date.now() - 10 * DAY_MS);
    await client.user.update({
      where: { id: userId },
      data: {
        activatedAt,
        passwordCredential: {
          create: {
            createdAt: activatedAt,
            passwordChangedAt: activatedAt,
            passwordHash: 'controlled-integration-hash',
          },
        },
        status: 'ACTIVE',
      },
    });
    const rawSession = (
      await new SessionService(client).create(userId)
    ).revealOnce();
    cookie = `sgi_session=${rawSession}`;

    const unit = await client.unit.create({
      data: { code: 'UNIDADES_IK', name: 'Unidades' },
    });
    const [dylan, luden] = await Promise.all([
      client.warehouse.findUniqueOrThrow({ where: { code: 'CASA_DYLAN' } }),
      client.warehouse.findUniqueOrThrow({ where: { code: 'CASA_LUDEN' } }),
    ]);
    const product = (code: string, active = true) =>
      client.product.create({
        data: { active, code, name: `Producto ${code}`, unitId: unit.id },
      });
    const balance = (
      productId: string,
      warehouseId: string,
      quantity: string,
      currentUnitPrice: string | null,
      priceReviewRequired = false,
    ) =>
      client.inventoryBalance.create({
        data: {
          currentUnitCost: '128.50',
          currentUnitPrice,
          priceReviewRequired,
          productId,
          quantity,
          warehouseId,
        },
      });

    const consistent = await product('CMP-NEG-M');
    await balance(consistent.id, dylan.id, '3', '300.00');
    await balance(consistent.id, luden.id, '1', '300.00');
    const mixed = await product('CMP-BLA-M');
    await balance(mixed.id, dylan.id, '2', '300.00');
    await balance(mixed.id, luden.id, '1', '320.00');
    const underReview = await product('DUR-NEG-U');
    await balance(underReview.id, dylan.id, '4', '150.00', true);
    const unpriced = await product('BOL-NEG-U');
    await balance(unpriced.id, dylan.id, '1', null);
    const soldOut = await product('CHA-GRI-S');
    await balance(soldOut.id, dylan.id, '0', '500.00');
    const inactive = await product('TOP-NEG-S', false);
    await balance(inactive.id, dylan.id, '2', '353.48');

    app = await createApplication();
    await app.init();
    csrfToken = app.get(CsrfTokenService).create(rawSession);
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
    if (client) await client.$disconnect();
    if (administrator && databaseName) {
      await administrator.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS ${quoteDatabaseName(databaseName)} WITH (FORCE)`,
      );
      await administrator.$disconnect();
    }
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnvironment)) delete process.env[key];
    }
    Object.assign(process.env, originalEnvironment);
  });

  it('shows the key once, stores only its hash and audits the creation', async () => {
    const response = await createKey('Bot de Marketplace').expect(201);
    const secret = String(response.body.data.secret);
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(response.body.data.key).toMatchObject({
      keyPrefix: secret.slice(0, 8),
      name: 'Bot de Marketplace',
      scopes: ['inventory.read'],
      status: 'ACTIVE',
    });

    const stored = await client.integrationKey.findUniqueOrThrow({
      where: { id: String(response.body.data.key.id) },
    });
    expect(stored.keyHash).toBe(sha256(secret));
    expect(JSON.stringify(stored)).not.toContain(secret);

    const audit = await client.auditLog.findMany({
      where: { entityId: stored.id, entityType: 'INTEGRATION' },
    });
    expect(audit.map(({ action }) => action)).toEqual([
      'INTEGRATION_KEY_CREATED',
    ]);
    expect(JSON.stringify(audit)).not.toContain(secret);
    expect(JSON.stringify(audit)).not.toContain(stored.keyHash);

    const list = await request(app.getHttpServer())
      .get('/api/v1/integrations/keys')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(200);
    expect(JSON.stringify(list.body)).not.toContain(secret);
    expect(
      list.body.data.some(({ id }: { id: string }) => id === stored.id),
    ).toBe(true);
  });

  it('returns only stocked, active products with a safe price and never the cost', async () => {
    const secret = String((await createKey()).body.data.secret);
    const response = await readCatalog(secret).expect(200);
    const items = response.body.data.items as Array<{
      code: string;
      priceIssue: string | null;
      totalQuantity: string;
      unitPrice: string | null;
    }>;
    const byCode = new Map(items.map((item) => [item.code, item]));

    expect([...byCode.keys()].sort()).toEqual(
      ['BOL-NEG-U', 'CMP-BLA-M', 'CMP-NEG-M', 'DUR-NEG-U'].sort(),
    );
    expect(byCode.get('CMP-NEG-M')).toMatchObject({
      priceIssue: null,
      unitPrice: '300.00',
    });
    expect(Number(byCode.get('CMP-NEG-M')?.totalQuantity)).toBe(4);
    expect(byCode.get('CMP-BLA-M')).toMatchObject({
      priceIssue: 'MIXED',
      unitPrice: null,
    });
    expect(byCode.get('DUR-NEG-U')).toMatchObject({
      priceIssue: 'REVIEW',
      unitPrice: null,
    });
    expect(byCode.get('BOL-NEG-U')).toMatchObject({
      priceIssue: 'MISSING',
      unitPrice: null,
    });

    const body = JSON.stringify(response.body);
    for (const leaked of [
      '128.50',
      'currentUnitCost',
      'unitCost',
      'valuations',
      'warehouse',
    ]) {
      expect(body).not.toContain(leaked);
    }
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('records one catalog read per sync and keeps the last use', async () => {
    const created = await createKey();
    const secret = String(created.body.data.secret);
    const keyId = String(created.body.data.key.id);

    await readCatalog(secret, '?page=1&pageSize=2').expect(200);
    await readCatalog(secret, '?page=2&pageSize=2').expect(200);

    const reads = await client.auditLog.count({
      where: { action: 'INTEGRATION_CATALOG_READ', entityId: keyId },
    });
    expect(reads).toBe(1);
    const stored = await client.integrationKey.findUniqueOrThrow({
      where: { id: keyId },
    });
    expect(stored.lastUsedAt).not.toBeNull();
  });

  it('keeps publishing a product after part of its stock is transferred (ADR-019)', async () => {
    const [dylan, jean, unit] = await Promise.all([
      client.warehouse.findUniqueOrThrow({ where: { code: 'CASA_DYLAN' } }),
      client.warehouse.findUniqueOrThrow({ where: { code: 'CASA_JEAN' } }),
      client.unit.findUniqueOrThrow({ where: { code: 'UNIDADES_IK' } }),
    ]);
    const moved = await client.product.create({
      data: { code: 'TRF-AZU-U', name: 'Producto TRF-AZU-U', unitId: unit.id },
    });
    await client.inventoryBalance.create({
      data: {
        currentUnitCost: '82.00',
        currentUnitPrice: '330.00',
        productId: moved.id,
        quantity: '3',
        warehouseId: dylan.id,
      },
    });

    await app
      .get(InventoryTransferService)
      .transfer(userId, `catalog-transfer-${randomUUID()}`, {
        fromWarehouseId: dylan.id,
        productId: moved.id,
        quantity: '1',
        reason: 'Reubicacion sintetica',
        toWarehouseId: jean.id,
      });

    const secret = String((await createKey()).body.data.secret);
    const response = await readCatalog(secret).expect(200);
    const item = (
      response.body.data.items as Array<{
        code: string;
        priceIssue: string | null;
        totalQuantity: string;
        unitPrice: string | null;
      }>
    ).find(({ code }) => code === 'TRF-AZU-U');
    expect(item).toMatchObject({ priceIssue: null, unitPrice: '330.00' });
    expect(Number(item?.totalQuantity)).toBe(3);
    expect(JSON.stringify(response.body)).not.toContain('82.00');
  });

  it('rejects a missing, malformed or unknown key', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/integrations/catalog')
      .set('Host', host)
      .expect(401);
    await readCatalog('not-a-key').expect(401);
    await readCatalog('A'.repeat(43)).expect(401);
  });

  it('does not accept a signed-in session in place of the key', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/integrations/catalog')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(401);
  });

  it('rejects unknown query parameters instead of ignoring them', async () => {
    const secret = String((await createKey()).body.data.secret);
    await readCatalog(secret, '?warehouseId=' + randomUUID()).expect(400);
  });

  it('stops a key at once when it is revoked and keeps revocation idempotent', async () => {
    const created = await createKey();
    const secret = String(created.body.data.secret);
    const keyId = String(created.body.data.key.id);
    await readCatalog(secret).expect(200);

    const revoke = () =>
      request(app.getHttpServer())
        .post(`/api/v1/integrations/keys/${keyId}/revoke`)
        .set('Host', host)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken)
        .send({});
    expect((await revoke().expect(200)).body.data.status).toBe('REVOKED');
    expect((await revoke().expect(200)).body.data.status).toBe('REVOKED');

    await readCatalog(secret).expect(401);
    const revocations = await client.auditLog.count({
      where: { action: 'INTEGRATION_KEY_REVOKED', entityId: keyId },
    });
    expect(revocations).toBe(1);
  });

  it('rejects an expired key', async () => {
    const created = await createKey();
    const keyId = String(created.body.data.key.id);
    await client.integrationKey.update({
      data: {
        createdAt: new Date(Date.now() - 2 * DAY_MS),
        expiresAt: new Date(Date.now() - DAY_MS),
      },
      where: { id: keyId },
    });
    await readCatalog(String(created.body.data.secret)).expect(401);
  });

  it('follows the owner: losing inventory.read forbids the key', async () => {
    const secret = String((await createKey()).body.data.secret);
    const denyId = await denyOwnerPermission('inventory.read');
    try {
      await readCatalog(secret).expect(403);
    } finally {
      await client.userPermission.delete({ where: { id: denyId } });
    }
    await readCatalog(secret).expect(200);
  });

  it('follows the owner: a password changed after issuing ends the key', async () => {
    const secret = String((await createKey()).body.data.secret);
    const original = await client.passwordCredential.findUniqueOrThrow({
      where: { userId },
    });
    await client.passwordCredential.update({
      data: { passwordChangedAt: new Date(Date.now() + 60_000) },
      where: { userId },
    });
    try {
      await readCatalog(secret).expect(401);
    } finally {
      await client.passwordCredential.update({
        data: { passwordChangedAt: original.passwordChangedAt },
        where: { userId },
      });
    }
  });

  it('enforces the per-minute limit', async () => {
    const created = await createKey();
    const keyId = String(created.body.data.key.id);
    const now = new Date();
    await client.integrationRateLimitWindow.create({
      data: { keyId, requestCount: 60, windowStartedAt: now },
    });
    await readCatalog(String(created.body.data.secret)).expect(429);
  });

  it('refuses to issue a key to an owner who cannot read inventory', async () => {
    const denyId = await denyOwnerPermission('inventory.read');
    try {
      await createKey().expect(403);
    } finally {
      await client.userPermission.delete({ where: { id: denyId } });
    }
  });

  it('refuses a lifetime above the approved maximum', async () => {
    await createKey('Demasiado larga', 91).expect(400);
  });

  it('refuses key management without integrations.manage', async () => {
    const denyId = await denyOwnerPermission('integrations.manage');
    try {
      await request(app.getHttpServer())
        .get('/api/v1/integrations/keys')
        .set('Host', host)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .expect(403);
      await createKey().expect(403);
    } finally {
      await client.userPermission.delete({ where: { id: denyId } });
    }
  });

  it('synchronizes the Marketplace bot, allows read-only view for sales.read and restricts remote commands to integrations.manage (ADR-024)', async () => {
    const instanceKey = 'pc-principal';
    const catalogKey = (await createKey('Llave de catálogo')).body.data
      .secret as string;
    const botKey = await createKey('Bot PC Principal', 30, instanceKey).expect(
      201,
    );
    const secret = botKey.body.data.secret as string;
    expect(botKey.body.data.key).toMatchObject({
      scopes: ['marketplace-bot.sync'],
      marketplaceBotInstanceKey: instanceKey,
    });
    await readCatalog(secret).expect(403);

    const sync = (bearer: string) =>
      request(app.getHttpServer())
        .post('/api/v1/integrations/marketplace-bot/sync')
        .set('Host', host)
        .set('Authorization', `Bearer ${bearer}`);
    const heartbeat = {
      botVersion: '2026.11',
      commandResults: [],
      instanceKey,
      instanceName: 'PC Principal',
      snapshot: { worker: { enabled: true } },
    };
    await sync(catalogKey).send(heartbeat).expect(403);
    await sync(secret)
      .send({ ...heartbeat, instanceKey: 'otra-instancia' })
      .expect(403);

    const enqueue = (
      instanceId: string,
      command: object,
      requestId = randomUUID(),
    ) =>
      request(app.getHttpServer())
        .post(`/api/v1/integrations/marketplace-bot/${instanceId}/commands`)
        .set('Host', host)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ command, requestId });
    const cancel = (id: string) =>
      request(app.getHttpServer())
        .post(`/api/v1/integrations/marketplace-bot/commands/${id}/cancel`)
        .set('Host', host)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken)
        .send({});

    const firstSync = await request(app.getHttpServer())
      .post('/api/v1/integrations/marketplace-bot/sync')
      .set('Host', host)
      .set('Authorization', `Bearer ${secret}`)
      .send({
        botVersion: '2026.11',
        commandResults: [],
        instanceKey: 'pc-principal',
        instanceName: 'PC Principal Comarca',
        snapshot: {
          accounts: [
            {
              dailyLimit: 3,
              displayName: 'Cuenta 1',
              key: 'acc-1',
              lastScanAt: '2026-11-13T14:00:00Z',
              pausedUntil: null,
              pauseReason: null,
              publishedToday: 1,
              publishedWeek: 5,
              status: 'healthy',
              weeklyLimit: 12,
            },
          ],
          alerts: [],
          leads: {
            awaitingReply: 2,
            products: [
              {
                activeListings: 2,
                clicks14d: 100,
                familyKey: 'camisa-columbia',
                focus: true,
                label: 'Camisa Columbia',
                leads14d: 9,
                leadsPer100Clicks: 9,
              },
            ],
            total14d: 14,
            unanswered: [
              {
                account: 'acc-1',
                label: 'Juan · Camisa Columbia',
                lastActivity: 'Hace 1h',
                neverAnswered: true,
                startedOn: '13 nov',
                title: 'Camisa Columbia M',
              },
            ],
            unansweredRecent: 1,
          },
          listings: {
            actionable: 1,
            items: [
              {
                account: 'acc-1',
                ageDays: 9,
                clicks14d: 45,
                executable: true,
                key: 'acc-1::12345',
                leads14d: 4,
                listedOn: '2026-11-04',
                pendingAction: null,
                recommendation: 'renew',
                recommendationLabel: 'Renovar',
                recommendationReason: 'Buena conversión y >7 días',
                status: 'active',
                title: 'Camisa Columbia M',
              },
            ],
            totalActive: 4,
          },
          queue: {
            summary: { planned: 2, published: 3, queued: 1 },
            upcoming: [],
          },
          worker: {
            currentItem: null,
            enabled: true,
            mode: 'live',
            processRunning: true,
            safetyLevel: 'balanced',
            status: 'running',
          },
        },
      })
      .expect(200);

    expect(firstSync.body.data.pendingCommands).toEqual([]);

    const adminState = await request(app.getHttpServer())
      .get('/api/v1/integrations/marketplace-bot')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(200);

    expect(adminState.body.data.canControl).toBe(true);
    expect(adminState.body.data.instances).toHaveLength(1);
    const instanceId = String(adminState.body.data.instances[0].id);
    expect(adminState.body.data.instances[0]).toMatchObject({
      connection: 'ONLINE',
      instanceName: 'PC Principal Comarca',
    });
    expect(adminState.body.data.instances[0].snapshot.leads.awaitingReply).toBe(
      2,
    );

    const pause = { enabled: false, type: 'SET_BOT_ENABLED' };
    const requestId = randomUUID();
    const [queued, duplicate] = await Promise.all([
      enqueue(instanceId, pause, requestId).expect(201),
      enqueue(instanceId, pause, requestId).expect(201),
    ]);
    expect(duplicate.body.data.id).toBe(queued.body.data.id);
    await enqueue(instanceId, { ...pause, enabled: true }, requestId).expect(
      409,
    );
    const commandId = String(queued.body.data.id);
    expect(queued.body.data.status).toBe('PENDING');

    const toCancel = await request(app.getHttpServer())
      .post(`/api/v1/integrations/marketplace-bot/${instanceId}/commands`)
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        command: { type: 'SYNC_SGI_CATALOG' },
        requestId: randomUUID(),
      })
      .expect(201);
    const cancelId = String(toCancel.body.data.id);

    // A seller with sales.read (without integrations.manage) can read the
    // monitor and leads, with canControl = false, and cannot send or cancel commands.
    const denyId = await denyOwnerPermission('integrations.manage');
    try {
      const sellerState = await request(app.getHttpServer())
        .get('/api/v1/integrations/marketplace-bot')
        .set('Host', host)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .expect(200);
      expect(sellerState.body.data.canControl).toBe(false);
      expect(sellerState.body.data.instances).toHaveLength(1);
      expect(sellerState.body.data.instances[0].commands).toEqual([]);
      await sync(secret).send(heartbeat).expect(403);

      await request(app.getHttpServer())
        .post(`/api/v1/integrations/marketplace-bot/${instanceId}/commands`)
        .set('Host', host)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          command: { type: 'RESOLVE_ALL_ALERTS' },
          requestId: randomUUID(),
        })
        .expect(403);

      await request(app.getHttpServer())
        .post(
          `/api/v1/integrations/marketplace-bot/commands/${cancelId}/cancel`,
        )
        .set('Host', host)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken)
        .send({})
        .expect(403);
    } finally {
      await client.userPermission.delete({ where: { id: denyId } });
    }

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/integrations/marketplace-bot/commands/${cancelId}/cancel`)
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');

    const claimedResult = {
      detail: 'Reporte anticipado',
      id: commandId,
      status: 'COMPLETED',
    };
    const oldClient = await sync(secret)
      .send({ ...heartbeat, commandResults: [claimedResult] })
      .expect(200);
    expect(oldClient.body.data.pendingCommands).toEqual([]);
    expect(
      await client.marketplaceBotCommand.findUnique({
        where: { id: commandId },
      }),
    ).toMatchObject({ status: 'PENDING', dispatchedAt: null });

    const commandHeartbeat = { ...heartbeat, commandProtocolVersion: 1 };
    const secondSync = await sync(secret).send(commandHeartbeat).expect(200);

    expect(secondSync.body.data.pendingCommands).toEqual([
      expect.objectContaining({
        id: commandId,
        payload: { enabled: false, type: 'SET_BOT_ENABLED' },
      }),
    ]);

    await cancel(commandId).expect(409);
    const retrySync = await sync(secret).send(commandHeartbeat).expect(200);
    expect(retrySync.body.data.pendingCommands).toEqual(
      secondSync.body.data.pendingCommands,
    );
    expect(
      await client.marketplaceBotCommand.findUnique({
        where: { id: commandId },
      }),
    ).toMatchObject({ status: 'DISPATCHED', dispatchedAt: expect.any(Date) });

    const thirdSync = await request(app.getHttpServer())
      .post('/api/v1/integrations/marketplace-bot/sync')
      .set('Host', host)
      .set('Authorization', `Bearer ${secret}`)
      .send({
        botVersion: '2026.11',
        commandResults: [
          {
            detail: 'Bot pausado desde SGI.',
            id: commandId,
            status: 'COMPLETED',
          },
        ],
        instanceKey: 'pc-principal',
        instanceName: 'PC Principal Comarca',
        snapshot: { worker: { enabled: false } },
      })
      .expect(200);

    expect(thirdSync.body.data.pendingCommands).toEqual([]);
    await sync(secret)
      .send({ ...commandHeartbeat, commandResults: [claimedResult] })
      .expect(200);
    const auditRows = await client.auditLog.findMany({
      orderBy: { occurredAt: 'asc' },
      where: { entityId: commandId },
    });
    expect(auditRows.map(({ action }) => action)).toEqual([
      'INTEGRATION_BOT_COMMAND_QUEUED',
      'INTEGRATION_BOT_COMMAND_RESULT',
    ]);

    const finalState = await request(app.getHttpServer())
      .get('/api/v1/integrations/marketplace-bot')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(200);
    const commands = finalState.body.data.instances[0].commands as Array<{
      id: string;
      resultDetail: string | null;
      status: string;
    }>;
    expect(commands.find((item) => item.id === commandId)).toMatchObject({
      resultDetail: 'Bot pausado desde SGI.',
      status: 'COMPLETED',
    });
    expect(commands.find((item) => item.id === cancelId)?.status).toBe(
      'CANCELLED',
    );
    const keyId = String(botKey.body.data.key.id);
    await request(app.getHttpServer())
      .post(`/api/v1/integrations/keys/${keyId}/revoke`)
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(200);
    await sync(secret).send(heartbeat).expect(401);
    const replacement = await createKey(
      'Rotación del bot',
      30,
      instanceKey,
    ).expect(201);
    const replacementSecret = String(replacement.body.data.secret);
    await sync(replacementSecret).send(heartbeat).expect(200);
    expect(await client.marketplaceBotInstance.count()).toBe(1);

    const largeListing = (index: number) => ({
      account: 'acc-1',
      key: `acc-1::${index.toString()}`,
      listedOn: '2026-11-04',
      recommendation: 'renew',
      recommendationLabel: 'L'.repeat(80),
      recommendationReason: 'R'.repeat(280),
      status: 'in_stock',
      title: 'T'.repeat(140),
    });
    const largeSnapshot = {
      listings: {
        items: Array.from({ length: 300 }, (_, index) => largeListing(index)),
      },
    };
    expect(JSON.stringify(largeSnapshot).length).toBeGreaterThan(150_000);
    await sync(replacementSecret)
      .send({ ...heartbeat, snapshot: largeSnapshot })
      .expect(200);
    const storedLarge = await client.marketplaceBotInstance.findUniqueOrThrow({
      select: { snapshot: true },
      where: { id: instanceId },
    });
    expect(
      (storedLarge.snapshot as { listings: { items: unknown[] } }).listings
        .items,
    ).toHaveLength(80);

    await sync(replacementSecret)
      .send({ ...heartbeat, snapshot: { filler: 'x'.repeat(1_100_000) } })
      .expect(413);
    const oversizedCreate = await createKey('n'.repeat(150_000));
    expect(oversizedCreate.status).toBe(413);

    const queuedLong = await enqueue(instanceId, {
      type: 'SYNC_SGI_CATALOG',
    }).expect(201);
    const longCommandId = String(queuedLong.body.data.id);
    await sync(replacementSecret).send(commandHeartbeat).expect(200);
    await sync(replacementSecret)
      .send({
        ...commandHeartbeat,
        commandResults: [
          { detail: 'e'.repeat(4_000), id: longCommandId, status: 'FAILED' },
        ],
      })
      .expect(200);
    const failedLong = await client.marketplaceBotCommand.findUniqueOrThrow({
      where: { id: longCommandId },
    });
    expect(failedLong.status).toBe('FAILED');
    expect(failedLong.resultDetail).toHaveLength(500);
  });
});
