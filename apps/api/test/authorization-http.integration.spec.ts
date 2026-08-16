import {
  Controller,
  Get,
  Module,
  Post,
  type INestApplication,
} from '@nestjs/common';
import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { EffectivePermissionsService } from '../src/auth/application/effective-permissions.service.js';
import { SessionService } from '../src/auth/application/session.service.js';
import { CurrentUser } from '../src/auth/decorators/current-user.decorator.js';
import { PublicRoute } from '../src/auth/decorators/public-route.decorator.js';
import { RequirePermission } from '../src/auth/decorators/require-permission.decorator.js';
import type { AuthenticatedRequestContext } from '../src/auth/http/auth-http-context.js';
import { CsrfTokenService } from '../src/auth/http/csrf-token.service.js';
import { AuthTokenService } from '../src/auth/infrastructure/auth-token.service.js';
import { createApplication } from '../src/bootstrap.js';
import { runBootstrap } from '../../../packages/database/src/bootstrap/run-bootstrap.js';

const sharedDatabaseUrl = process.env.DATABASE_URL;
if (!sharedDatabaseUrl) {
  throw new Error('Integration database setup did not provide DATABASE_URL.');
}

const execFileAsync = promisify(execFile);

function quoteDatabaseName(databaseName: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(databaseName)) {
    throw new Error('Unsafe temporary database name.');
  }
  return `"${databaseName}"`;
}

async function migrateDatabase(databaseUrl: string): Promise<void> {
  const databaseRoot = fileURLToPath(
    new URL('../../../packages/database/', import.meta.url),
  );
  const prismaCli = fileURLToPath(
    new URL(
      '../../../packages/database/node_modules/prisma/build/index.js',
      import.meta.url,
    ),
  );
  const prismaConfig = fileURLToPath(
    new URL('../../../packages/database/prisma.config.ts', import.meta.url),
  );
  await execFileAsync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--config', prismaConfig],
    {
      cwd: databaseRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      maxBuffer: 1024 * 1024,
    },
  );
}

@Controller({ path: 'block-four-test', version: '1' })
class BlockFourTestController {
  @Get('private')
  privateRoute(
    @CurrentUser() current: AuthenticatedRequestContext,
  ): AuthenticatedRequestContext {
    return current;
  }

  @Get('inventory')
  @RequirePermission('inventory.adjust')
  inventory(): { allowed: true } {
    return { allowed: true };
  }

  @Get('transfer')
  @RequirePermission('transfers.create')
  transfer(): { allowed: true } {
    return { allowed: true };
  }

  @Post('mutate')
  mutate(): { changed: true } {
    return { changed: true };
  }

  @Post('public-mutation')
  @PublicRoute()
  publicMutation(): { accepted: true } {
    return { accepted: true };
  }

  @Get('internal-error')
  internalError(): never {
    throw new Error('sensitive-token-and-SQL-SELECT');
  }
}

@Module({ imports: [AppModule], controllers: [BlockFourTestController] })
class BlockFourTestModule {}

describe('BLOQUE 4 authorization and HTTP security', () => {
  let administrator!: DatabaseClient;
  let app!: INestApplication;
  let client!: DatabaseClient;
  let databaseName: string;
  let dylanId: string;

  beforeAll(async () => {
    const source = new URL(sharedDatabaseUrl);
    databaseName =
      'sgi_block4_' +
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
    client = createDatabaseClient(isolatedUrl.toString());
    await runBootstrap(client);
    const dylan = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'dylan' },
      select: { id: true },
    });
    dylanId = dylan.id;
    app = await createApplication(BlockFourTestModule);
    await app.init();
  }, 120_000);

  beforeEach(async () => {
    await client.session.deleteMany();
    await client.userPermission.deleteMany({
      where: {
        userId: dylanId,
        permission: { code: { not: 'sales.cancel' } },
      },
    });
    await client.user.update({
      where: { id: dylanId },
      data: { activatedAt: new Date(), status: 'ACTIVE' },
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (client) await client.$disconnect();
    if (administrator && databaseName) {
      await administrator.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS ${quoteDatabaseName(databaseName)} WITH (FORCE)`,
      );
      await administrator.$disconnect();
    }
  });

  async function activeSession(): Promise<string> {
    return (await app.get(SessionService).create(dylanId)).revealOnce();
  }

  function cookie(token: string): string {
    return `sgi_session=${token}`;
  }

  async function insertSession(input: {
    absoluteExpiresAt: Date;
    createdAt: Date;
    idleExpiresAt: Date;
    lastSeenAt: Date;
  }): Promise<string> {
    const generated = new AuthTokenService().generate();
    await client.session.create({
      data: {
        ...input,
        tokenHash: generated.tokenHash,
        userId: dylanId,
      },
    });
    return generated.secret.revealOnce();
  }

  it('keeps public health routes available and leaves Swagger unmounted', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Host', 'localhost:3001')
      .expect(200)
      .expect('Cache-Control', 'no-store');
    await request(app.getHttpServer())
      .get('/api/v1/ready')
      .set('Host', 'localhost:3001')
      .expect(200);

    const swagger = await request(app.getHttpServer())
      .get('/api/docs')
      .set('Host', 'localhost:3001');
    expect(swagger.status).not.toBe(200);
    expect(swagger.text).not.toContain('swagger-ui');
  });

  it('rejects anonymous and invalid sessions and clears a residual cookie', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/block-four-test/private')
      .set('Host', 'localhost:3001')
      .expect(401)
      .expect('Cache-Control', 'no-store');

    const invalid = await request(app.getHttpServer())
      .get('/api/v1/block-four-test/private')
      .set('Host', 'localhost:3001')
      .set('Cookie', cookie(Buffer.alloc(32, 0x55).toString('base64url')))
      .expect(401);
    expect(String(invalid.headers['set-cookie'])).toContain(
      'sgi_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax',
    );
    expect(invalid.text).not.toContain('SessionError');
  });

  it('accepts a live session, renews it, and rejects expired or revoked rows', async () => {
    const validToken = await activeSession();
    const valid = await request(app.getHttpServer())
      .get('/api/v1/block-four-test/private')
      .set('Host', 'localhost:3001')
      .set('Cookie', cookie(validToken))
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(valid.body).toMatchObject({ userId: dylanId });
    expect(String(valid.headers['set-cookie'])).toContain('sgi_session=');

    const now = Date.now();
    const expiredToken = await insertSession({
      absoluteExpiresAt: new Date(now - 60 * 60 * 1000),
      createdAt: new Date(now - 9 * 60 * 60 * 1000),
      idleExpiresAt: new Date(now - 60 * 60 * 1000),
      lastSeenAt: new Date(now - 90 * 60 * 1000),
    });
    await request(app.getHttpServer())
      .get('/api/v1/block-four-test/private')
      .set('Host', 'localhost:3001')
      .set('Cookie', cookie(expiredToken))
      .expect(401);

    const revokedToken = await activeSession();
    const hashes = new AuthTokenService();
    await client.session.update({
      where: { tokenHash: hashes.hashValidatedToken(revokedToken)! },
      data: { revokeReason: 'TEST', revokedAt: new Date() },
    });
    await request(app.getHttpServer())
      .get('/api/v1/block-four-test/private')
      .set('Host', 'localhost:3001')
      .set('Cookie', cookie(revokedToken))
      .expect(401);
  });

  it('never renews idle expiry beyond the eight-hour absolute boundary', async () => {
    const now = Date.now();
    const absoluteExpiresAt = new Date(now + 5 * 60 * 1000);
    const token = await insertSession({
      absoluteExpiresAt,
      createdAt: new Date(now - (7 * 60 + 55) * 60 * 1000),
      idleExpiresAt: absoluteExpiresAt,
      lastSeenAt: new Date(now - 60 * 1000),
    });
    const tokenHash = new AuthTokenService().hashValidatedToken(token)!;

    await request(app.getHttpServer())
      .get('/api/v1/block-four-test/private')
      .set('Host', 'localhost:3001')
      .set('Cookie', cookie(token))
      .expect(200);
    const session = await client.session.findUniqueOrThrow({
      where: { tokenHash },
    });
    expect(session.idleExpiresAt.getTime()).toBeLessThanOrEqual(
      absoluteExpiresAt.getTime(),
    );
  });

  it('requires CSRF only on authenticated unsafe methods', async () => {
    const token = await activeSession();
    const csrf = app.get(CsrfTokenService).create(token);
    const csrfPrefix = 'v1.';
    const csrfPayload = csrf.slice(csrfPrefix.length);
    const corruptedPayload =
      (csrfPayload.startsWith('A') ? 'B' : 'A') + csrfPayload.slice(1);
    const corruptedCsrf = csrfPrefix + corruptedPayload;

    expect(corruptedCsrf).not.toBe(csrf);
    expect(corruptedCsrf).toHaveLength(csrf.length);
    expect(corruptedCsrf).toMatch(/^v1\.[A-Za-z0-9_-]{43}$/u);
    expect(corruptedCsrf.slice(0, csrfPrefix.length)).toBe(csrfPrefix);
    expect(corruptedCsrf[csrfPrefix.length]).not.toBe(csrf[csrfPrefix.length]);

    await request(app.getHttpServer())
      .get('/api/v1/block-four-test/private')
      .set('Host', 'localhost:3001')
      .set('Cookie', cookie(token))
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/block-four-test/mutate')
      .set('Host', 'localhost:3001')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookie(token))
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/block-four-test/mutate')
      .set('Host', 'localhost:3001')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookie(token))
      .set('X-CSRF-Token', corruptedCsrf)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/block-four-test/mutate')
      .set('Host', 'localhost:3001')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookie(token))
      .set('X-CSRF-Token', csrf)
      .expect(201);
  });

  it('enforces exact Origin, Host, and CORS allowlists', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/block-four-test/public-mutation')
      .set('Host', 'localhost:3001')
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/block-four-test/public-mutation')
      .set('Host', 'localhost:3001')
      .set('Origin', 'null')
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/block-four-test/public-mutation')
      .set('Host', 'localhost:3001')
      .set('Origin', 'http://localhost:3000.evil.test')
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/block-four-test/public-mutation')
      .set('Host', 'localhost:3001')
      .set('Origin', 'http://localhost:3000')
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Host', 'evil.test')
      .expect(403);

    const preflight = await request(app.getHttpServer())
      .options('/api/v1/block-four-test/mutate')
      .set('Host', 'localhost:3001')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    expect(preflight.headers['access-control-allow-credentials']).toBe('true');

    const rejected = await request(app.getHttpServer())
      .options('/api/v1/block-four-test/mutate')
      .set('Host', 'localhost:3001')
      .set('Origin', 'http://evil.test')
      .set('Access-Control-Request-Method', 'POST');
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('applies Helmet and sanitizes sensitive internal errors', async () => {
    const token = await activeSession();
    const response = await request(app.getHttpServer())
      .get('/api/v1/block-four-test/internal-error?secret=query-value')
      .set('Host', 'localhost:3001')
      .set('Cookie', cookie(token))
      .expect(500)
      .expect('Cache-Control', 'no-store');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.text).not.toContain('sensitive-token');
    expect(response.text).not.toContain('SELECT');
    expect(response.text).not.toContain(token);
  });

  it('resolves grants from PostgreSQL with direct DENY precedence and immediate revocation', async () => {
    const service = app.get(EffectivePermissionsService);
    expect(await service.hasPermission(dylanId, 'inventory.adjust')).toBe(true);
    expect(await service.hasPermission(dylanId, 'inventory.read')).toBe(true);
    expect(await service.hasPermission(dylanId, 'transfers.create')).toBe(
      false,
    );
    expect(await service.hasPermission(dylanId, 'users.status.manage')).toBe(
      true,
    );

    const inventoryReadPermission = await client.permission.findUniqueOrThrow({
      where: { code: 'inventory.read' },
      select: { id: true },
    });
    const readDeny = await client.userPermission.create({
      data: {
        effect: 'DENY',
        permissionId: inventoryReadPermission.id,
        userId: dylanId,
      },
    });
    expect(await service.hasPermission(dylanId, 'inventory.read')).toBe(false);
    expect(await service.hasPermission(dylanId, 'inventory.adjust')).toBe(true);
    await client.userPermission.update({
      where: { id: readDeny.id },
      data: { revokedAt: new Date() },
    });
    expect(await service.hasPermission(dylanId, 'inventory.read')).toBe(true);

    const inventoryPermission = await client.permission.findUniqueOrThrow({
      where: { code: 'inventory.adjust' },
      select: { id: true },
    });
    const deny = await client.userPermission.create({
      data: {
        effect: 'DENY',
        permissionId: inventoryPermission.id,
        userId: dylanId,
      },
    });
    expect(await service.hasPermission(dylanId, 'inventory.adjust')).toBe(
      false,
    );
    await client.userPermission.update({
      where: { id: deny.id },
      data: { revokedAt: new Date() },
    });
    expect(await service.hasPermission(dylanId, 'inventory.adjust')).toBe(true);

    const newPermission = await client.permission.create({
      data: {
        code: `test.block4.${Date.now()}`,
        description: 'Permission created only for authorization testing.',
      },
    });
    expect(await service.hasPermission(dylanId, newPermission.code)).toBe(
      false,
    );
    const directGrant = await client.userPermission.create({
      data: { permissionId: newPermission.id, userId: dylanId },
    });
    expect(await service.hasPermission(dylanId, newPermission.code)).toBe(true);
    await client.userPermission.update({
      where: { id: directGrant.id },
      data: { revokedAt: new Date() },
    });
    expect(await service.hasPermission(dylanId, newPermission.code)).toBe(
      false,
    );
    await client.userPermission.deleteMany({
      where: { permissionId: newPermission.id },
    });
    await client.permission.delete({ where: { id: newPermission.id } });
  });

  it('does not infer inventory.read from inventory.adjust', async () => {
    const service = app.get(EffectivePermissionsService);
    const inventoryAdjust = await client.permission.findUniqueOrThrow({
      where: { code: 'inventory.adjust' },
      select: { id: true },
    });
    const user = await client.user.create({
      data: {
        displayName: 'Inventory adjust only test',
        loginIdentifier: `inventory_adjust_only_${Date.now()}`,
        status: 'ACTIVE',
        userPermissions: {
          create: { permissionId: inventoryAdjust.id },
        },
      },
    });

    try {
      expect(await service.hasPermission(user.id, 'inventory.adjust')).toBe(
        true,
      );
      expect(await service.hasPermission(user.id, 'inventory.read')).toBe(
        false,
      );
    } finally {
      await client.userPermission.deleteMany({ where: { userId: user.id } });
      await client.user.delete({ where: { id: user.id } });
    }
  });

  it('enforces effective permissions through the HTTP guard', async () => {
    const token = await activeSession();
    const initialSession = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Host', 'localhost:3001')
      .set('Cookie', cookie(token))
      .expect(200);
    expect(initialSession.body.data.permissions).toContain('inventory.adjust');
    await request(app.getHttpServer())
      .get('/api/v1/block-four-test/inventory')
      .set('Host', 'localhost:3001')
      .set('Cookie', cookie(token))
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/block-four-test/transfer')
      .set('Host', 'localhost:3001')
      .set('Cookie', cookie(token))
      .expect(403);

    const permission = await client.permission.findUniqueOrThrow({
      where: { code: 'inventory.adjust' },
      select: { id: true },
    });
    const deny = await client.userPermission.create({
      data: {
        effect: 'DENY',
        permissionId: permission.id,
        userId: dylanId,
      },
    });
    await request(app.getHttpServer())
      .get('/api/v1/block-four-test/inventory')
      .set('Host', 'localhost:3001')
      .set('Cookie', cookie(token))
      .expect(403);

    const deniedSession = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Host', 'localhost:3001')
      .set('Cookie', cookie(token))
      .expect(200);
    expect(deniedSession.body.data.permissions).not.toContain(
      'inventory.adjust',
    );

    await client.userPermission.update({
      where: { id: deny.id },
      data: { revokedAt: new Date() },
    });
    const restoredSession = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Host', 'localhost:3001')
      .set('Cookie', cookie(token))
      .expect(200);
    expect(restoredSession.body.data.permissions).toContain('inventory.adjust');
    await request(app.getHttpServer())
      .get('/api/v1/block-four-test/inventory')
      .set('Host', 'localhost:3001')
      .set('Cookie', cookie(token))
      .expect(200);
  });

  it('does not infer grants from the ADMIN role name', async () => {
    const service = app.get(EffectivePermissionsService);
    const adminRole = await client.role.findUniqueOrThrow({
      where: { code: 'ADMIN' },
      select: { id: true },
    });
    const user = await client.user.create({
      data: {
        displayName: 'Renamed authorization test',
        loginIdentifier: `block4_${Date.now()}`,
        status: 'ACTIVE',
        userRoles: { create: { roleId: adminRole.id } },
      },
    });
    try {
      expect(await service.hasPermission(user.id, 'users.status.manage')).toBe(
        true,
      );
      expect(await service.hasPermission(user.id, 'finances.read')).toBe(false);
      expect(await service.hasPermission(user.id, 'inventory.adjust')).toBe(
        false,
      );
      expect(await service.hasPermission(user.id, 'inventory.read')).toBe(
        false,
      );
      expect(await service.hasPermission(user.id, 'sales.create')).toBe(false);
      expect(await service.hasPermission(user.id, 'transfers.create')).toBe(
        false,
      );
    } finally {
      await client.userRole.deleteMany({ where: { userId: user.id } });
      await client.user.delete({ where: { id: user.id } });
    }
  });
});
