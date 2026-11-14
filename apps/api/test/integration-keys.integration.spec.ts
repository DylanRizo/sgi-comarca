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

  const createKey = (name = 'Bot de prueba', expiresInDays = 30) =>
    request(app.getHttpServer())
      .post('/api/v1/integrations/keys')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ expiresInDays, name });

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
    const secret = String(
      (await createKey('Bot PC Principal')).body.data.secret,
    );

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

    const queued = await request(app.getHttpServer())
      .post(`/api/v1/integrations/marketplace-bot/${instanceId}/commands`)
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({
        command: { enabled: false, type: 'SET_BOT_ENABLED' },
      })
      .expect(201);
    const commandId = String(queued.body.data.id);
    expect(queued.body.data.status).toBe('PENDING');

    const toCancel = await request(app.getHttpServer())
      .post(`/api/v1/integrations/marketplace-bot/${instanceId}/commands`)
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({
        command: { type: 'SYNC_SGI_CATALOG' },
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

      await request(app.getHttpServer())
        .post(`/api/v1/integrations/marketplace-bot/${instanceId}/commands`)
        .set('Host', host)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          command: { type: 'RESOLVE_ALL_ALERTS' },
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

    const secondSync = await request(app.getHttpServer())
      .post('/api/v1/integrations/marketplace-bot/sync')
      .set('Host', host)
      .set('Authorization', `Bearer ${secret}`)
      .send({
        botVersion: '2026.11',
        commandResults: [],
        instanceKey: 'pc-principal',
        instanceName: 'PC Principal Comarca',
        snapshot: { worker: { enabled: true } },
      })
      .expect(200);

    expect(secondSync.body.data.pendingCommands).toEqual([
      expect.objectContaining({
        id: commandId,
        payload: { enabled: false, type: 'SET_BOT_ENABLED' },
      }),
    ]);

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
  });

  describe('Marketplace bot command queue (ADR-024)', () => {
    const syncBot = (
      secret: string,
      instanceKey: string,
      body: Record<string, unknown> = {},
    ) =>
      request(app.getHttpServer())
        .post('/api/v1/integrations/marketplace-bot/sync')
        .set('Host', host)
        .set('Authorization', `Bearer ${secret}`)
        .send({
          botVersion: '2026.11',
          instanceKey,
          instanceName: 'PC de prueba',
          snapshot: {},
          ...body,
        });

    const enqueue = (
      instanceId: string,
      command: Record<string, unknown>,
      idempotencyKey: string | null = randomUUID(),
    ) => {
      const pending = request(app.getHttpServer())
        .post(`/api/v1/integrations/marketplace-bot/${instanceId}/commands`)
        .set('Host', host)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken);
      return (
        idempotencyKey === null
          ? pending
          : pending.set('Idempotency-Key', idempotencyKey)
      ).send({ command });
    };

    const cancel = (commandId: string) =>
      request(app.getHttpServer())
        .post(
          `/api/v1/integrations/marketplace-bot/commands/${commandId}/cancel`,
        )
        .set('Host', host)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken)
        .send({});

    /** A fresh key and instance per test: each key has its own rate window. */
    const startInstance = async (instanceKey: string) => {
      const secret = String((await createKey(instanceKey)).body.data.secret);
      await syncBot(secret, instanceKey).expect(200);
      const instance = await client.marketplaceBotInstance.findUniqueOrThrow({
        select: { id: true },
        where: { instanceKey },
      });
      return { instanceId: instance.id, secret };
    };

    const readCommand = (id: string) =>
      client.marketplaceBotCommand.findUniqueOrThrow({ where: { id } });

    const age = (
      commandId: string,
      column: 'created_at' | 'delivered_at',
      interval: string,
    ) =>
      client.$executeRawUnsafe(
        `UPDATE marketplace_bot_commands SET ${column} = now() - interval '${interval}' WHERE id = $1::uuid`,
        commandId,
      );

    it('hands a command to the bot exactly once and refuses to cancel it afterwards', async () => {
      const { instanceId, secret } = await startInstance('queue-once-01');
      const queued = await enqueue(instanceId, {
        action: 'delete',
        key: 'acc-1::1',
        type: 'LISTING_ACTION',
      }).expect(201);
      const commandId = String(queued.body.data.id);
      expect(queued.body.data.deliveredAt).toBeNull();

      const delivered = await syncBot(secret, 'queue-once-01').expect(200);
      expect(delivered.body.data.pendingCommands).toEqual([
        expect.objectContaining({ id: commandId }),
      ]);
      // The next heartbeat arrives before the bot has finished: the command
      // must not be sent a second time.
      const next = await syncBot(secret, 'queue-once-01').expect(200);
      expect(next.body.data.pendingCommands).toEqual([]);

      // The bot already has it, so the SGI cannot claim it was cancelled.
      await cancel(commandId).expect(409);
      const stillWaiting = await readCommand(commandId);
      expect(stillWaiting.status).toBe('PENDING');
      expect(stillWaiting.deliveredAt).not.toBeNull();

      await syncBot(secret, 'queue-once-01', {
        commandResults: [
          { detail: 'Anuncio eliminado.', id: commandId, status: 'COMPLETED' },
        ],
      }).expect(200);
      const finished = await readCommand(commandId);
      expect(finished).toMatchObject({
        resultDetail: 'Anuncio eliminado.',
        status: 'COMPLETED',
      });

      // Cancelling a finished command stays idempotent and changes nothing.
      const late = await cancel(commandId).expect(200);
      expect(late.body.data.status).toBe('COMPLETED');
      await expect(
        client.auditLog.count({
          where: {
            action: 'INTEGRATION_BOT_COMMAND_CANCELLED',
            entityId: commandId,
          },
        }),
      ).resolves.toBe(0);
    });

    it('records the outcome the bot reports even when it arrives after the expiry window', async () => {
      const { instanceId, secret } = await startInstance('queue-late-01');
      const queued = await enqueue(instanceId, {
        type: 'RESOLVE_ALL_ALERTS',
      }).expect(201);
      const commandId = String(queued.body.data.id);
      await syncBot(secret, 'queue-late-01').expect(200);

      // Picked up just before the two hours and reported just after.
      await age(commandId, 'created_at', '2 hours 5 minutes');
      await age(commandId, 'delivered_at', '2 hours 1 minute');
      await syncBot(secret, 'queue-late-01', {
        commandResults: [{ detail: 'Listo.', id: commandId, status: 'FAILED' }],
      }).expect(200);
      expect(await readCommand(commandId)).toMatchObject({
        resultDetail: 'Listo.',
        status: 'FAILED',
      });
    });

    it('expires a command the bot never received and never hands it over', async () => {
      const { instanceId, secret } = await startInstance('queue-stale-01');
      const queued = await enqueue(instanceId, {
        type: 'SYNC_SGI_CATALOG',
      }).expect(201);
      const commandId = String(queued.body.data.id);
      await age(commandId, 'created_at', '2 hours 1 second');

      const sync = await syncBot(secret, 'queue-stale-01').expect(200);
      expect(sync.body.data.pendingCommands).toEqual([]);
      const expired = await readCommand(commandId);
      expect(expired.status).toBe('EXPIRED');
      expect(expired.deliveredAt).toBeNull();
      expect(expired.resultDetail).toContain('sin ser recibido');

      // The bot cannot report an outcome for something it was never given.
      await syncBot(secret, 'queue-stale-01', {
        commandResults: [{ id: commandId, status: 'COMPLETED' }],
      }).expect(200);
      expect((await readCommand(commandId)).status).toBe('EXPIRED');
    });

    it('says so when the bot took a command and never reported back, and accepts a late outcome', async () => {
      const { instanceId, secret } = await startInstance('queue-silent-01');
      const queued = await enqueue(instanceId, {
        replace: false,
        type: 'GENERATE_WEEK',
      }).expect(201);
      const commandId = String(queued.body.data.id);
      await syncBot(secret, 'queue-silent-01').expect(200);
      await age(commandId, 'delivered_at', '2 hours 1 second');

      const sync = await syncBot(secret, 'queue-silent-01').expect(200);
      expect(sync.body.data.pendingCommands).toEqual([]);
      const silent = await readCommand(commandId);
      expect(silent.status).toBe('EXPIRED');
      expect(silent.resultDetail).toContain('no reportó su resultado');

      await syncBot(secret, 'queue-silent-01', {
        commandResults: [
          { detail: 'Semana generada.', id: commandId, status: 'COMPLETED' },
        ],
      }).expect(200);
      expect(await readCommand(commandId)).toMatchObject({
        resultDetail: 'Semana generada.',
        status: 'COMPLETED',
      });
    });

    it('queues a repeated request once and rejects a reused key for another command', async () => {
      const { instanceId } = await startInstance('queue-idem-01');
      const key = randomUUID();
      const command = {
        action: 'relist',
        key: 'acc-1::9',
        type: 'LISTING_ACTION',
      };

      const first = await enqueue(instanceId, command, key).expect(201);
      // Same intent with the properties in another order.
      const replay = await enqueue(
        instanceId,
        { type: 'LISTING_ACTION', key: 'acc-1::9', action: 'relist' },
        key,
      ).expect(201);
      expect(replay.body.data.id).toBe(first.body.data.id);
      await expect(
        client.marketplaceBotCommand.count({ where: { instanceId } }),
      ).resolves.toBe(1);
      await expect(
        client.auditLog.count({
          where: {
            action: 'INTEGRATION_BOT_COMMAND_QUEUED',
            entityId: String(first.body.data.id),
          },
        }),
      ).resolves.toBe(1);

      await enqueue(
        instanceId,
        { action: 'delete', key: 'acc-1::9', type: 'LISTING_ACTION' },
        key,
      ).expect(409);
      await enqueue(instanceId, command, null).expect(400);
      await enqueue(instanceId, command, 'short').expect(400);
      await expect(
        client.marketplaceBotCommand.count({ where: { instanceId } }),
      ).resolves.toBe(1);

      const stored = await readCommand(String(first.body.data.id));
      expect(stored.idempotencyKeyHash).toBe(sha256(key));
      expect(JSON.stringify(stored)).not.toContain(key);
    });

    it('accepts a heartbeat larger than the default body limit and a long failure detail', async () => {
      const { instanceId, secret } = await startInstance('queue-large-01');
      const listing = (index: number) => ({
        account: 'acc-1',
        key: `acc-1::${index.toString()}`,
        listedOn: '2026-11-04',
        recommendation: 'renew',
        recommendationLabel: 'L'.repeat(80),
        recommendationReason: 'R'.repeat(280),
        status: 'active',
        title: 'T'.repeat(140),
      });
      const snapshot = {
        listings: {
          items: Array.from({ length: 300 }, (_, index) => listing(index)),
        },
      };
      expect(JSON.stringify(snapshot).length).toBeGreaterThan(150_000);
      await syncBot(secret, 'queue-large-01', { snapshot }).expect(200);
      const stored = await client.marketplaceBotInstance.findUniqueOrThrow({
        select: { snapshot: true },
        where: { id: instanceId },
      });
      // Parsed in full, stored bounded.
      expect(
        (stored.snapshot as { listings: { items: unknown[] } }).listings.items,
      ).toHaveLength(80);

      // Past the route's own allowance it is the request that is wrong.
      await syncBot(secret, 'queue-large-01', {
        snapshot: { filler: 'x'.repeat(1_100_000) },
      }).expect(413);
      // Every other route keeps the default limit.
      const oversized = await createKey('n'.repeat(150_000));
      expect(oversized.status).toBe(413);

      const queued = await enqueue(instanceId, {
        type: 'SYNC_SGI_CATALOG',
      }).expect(201);
      const commandId = String(queued.body.data.id);
      await syncBot(secret, 'queue-large-01').expect(200);
      await syncBot(secret, 'queue-large-01', {
        commandResults: [
          { detail: 'e'.repeat(4_000), id: commandId, status: 'FAILED' },
        ],
      }).expect(200);
      const failed = await readCommand(commandId);
      expect(failed.status).toBe('FAILED');
      expect(failed.resultDetail).toHaveLength(500);
    });
  });
});
