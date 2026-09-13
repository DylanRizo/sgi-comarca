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
});
