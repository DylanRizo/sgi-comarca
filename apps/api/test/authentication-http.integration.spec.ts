import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { Argon2PasswordHasher } from '../src/auth/infrastructure/argon2-password-hasher.js';
import { AuthTokenService } from '../src/auth/infrastructure/auth-token.service.js';
import { createApplication } from '../src/bootstrap.js';
import { runBootstrap } from '../../../packages/database/src/bootstrap/run-bootstrap.js';

const sharedDatabaseUrl = process.env.DATABASE_URL;
if (!sharedDatabaseUrl) {
  throw new Error('Integration database setup did not provide DATABASE_URL.');
}

const execFileAsync = promisify(execFile);
const approvedPassword = 'calm river orchard lantern';
const changedPassword = 'gentle mountain harbor phrase';
const host = 'localhost:3001';
const origin = 'http://localhost:3000';

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

function controlledToken(byte: number): string {
  return Buffer.alloc(32, byte).toString('base64url');
}

function cookieFrom(response: request.Response): string {
  const header = response.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error('Authentication response omitted its cookie.');
  return value.split(';')[0] ?? '';
}

describe.sequential('BLOQUE 5 authentication HTTP endpoints', () => {
  let administrator!: DatabaseClient;
  let client!: DatabaseClient;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let databaseName: string;
  let dylanId: string;
  const originalEnvironment = { ...process.env };

  beforeAll(async () => {
    const source = new URL(sharedDatabaseUrl);
    databaseName =
      'sgi_block5_' +
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
    client = createDatabaseClient(isolatedUrl.toString());
    await runBootstrap(client);
    dylanId = (
      await client.user.findUniqueOrThrow({
        where: { loginIdentifier: 'dylan' },
        select: { id: true },
      })
    ).id;
    app = await createApplication();
    await app.init();
  }, 120_000);

  beforeEach(async () => {
    await client.session.deleteMany();
    await client.userInvitation.deleteMany();
    await client.passwordCredential.deleteMany();
    await client.loginThrottle.deleteMany();
    await client.user.updateMany({
      data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
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
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnvironment)) delete process.env[key];
    }
    Object.assign(process.env, originalEnvironment);
  });

  async function createInvitation(
    byte: number,
    overrides: {
      createdAt?: Date;
      consumedAt?: Date;
      expiresAt?: Date;
      invalidatedAt?: Date;
    } = {},
    userId = dylanId,
  ): Promise<string> {
    const token = controlledToken(byte);
    const tokenHash = new AuthTokenService().hashValidatedToken(token);
    if (!tokenHash) throw new Error('Controlled invitation token is invalid.');
    const createdAt =
      overrides.createdAt ??
      overrides.consumedAt ??
      overrides.invalidatedAt ??
      new Date();
    const expiresAt =
      overrides.expiresAt ??
      new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    await client.userInvitation.create({
      data: {
        createdAt,
        expiresAt,
        tokenHash,
        userId,
        ...(overrides.consumedAt ? { consumedAt: overrides.consumedAt } : {}),
        ...(overrides.invalidatedAt
          ? {
              invalidatedAt: overrides.invalidatedAt,
              invalidationReason: 'CONTROLLED_TEST_INVALIDATION',
            }
          : {}),
      },
    });
    return token;
  }

  async function activateDylan(byte: number): Promise<{
    cookie: string;
    csrfToken: string;
  }> {
    const token = await createInvitation(byte);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/activate')
      .set('Host', host)
      .set('Origin', origin)
      .send({ password: approvedPassword, token })
      .expect(201);
    return {
      cookie: cookieFrom(response),
      csrfToken: String(response.body.data.csrfToken),
    };
  }

  async function activateUser(
    loginIdentifier: string,
    byte: number,
  ): Promise<{ cookie: string; userId: string }> {
    const user = await client.user.findUniqueOrThrow({
      where: { loginIdentifier },
      select: { id: true },
    });
    const token = await createInvitation(byte, {}, user.id);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/activate')
      .set('Host', host)
      .set('Origin', origin)
      .send({ password: approvedPassword, token })
      .expect(201);
    return { cookie: cookieFrom(response), userId: user.id };
  }

  it('activates atomically, sets the cookie after commit and omits every opaque token', async () => {
    const token = await createInvitation(0x21);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/activate')
      .set('Host', host)
      .set('Origin', origin)
      .set('X-Request-ID', 'controlled-activation-request')
      .send({ password: approvedPassword, token })
      .expect(201)
      .expect('Cache-Control', 'no-store');
    expect(response.headers['cache-control']).toBe('no-store');

    const serialized = JSON.stringify(response.body);
    expect(response.body).toMatchObject({
      data: {
        session: {
          absoluteExpiresAt: expect.any(String),
          idleExpiresAt: expect.any(String),
        },
        user: {
          id: dylanId,
          identifier: 'dylan',
          status: 'ACTIVE',
        },
      },
      meta: { requestId: 'controlled-activation-request' },
    });
    expect(response.body.data.csrfToken).toMatch(/^v1\.[A-Za-z0-9_-]{43}$/u);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(approvedPassword);
    expect(response.body.data).not.toHaveProperty('token');
    expect(response.body.data.user).not.toHaveProperty('roles');
    expect(String(response.headers['set-cookie'])).toContain('sgi_session=');
    expect(String(response.headers['set-cookie'])).toContain(
      'HttpOnly; SameSite=Lax',
    );
    expect(await client.passwordCredential.count()).toBe(1);
    expect(await client.session.count()).toBe(1);
  });

  it('returns one sanitized activation error for malformed, expired, consumed and invalidated invitations', async () => {
    const malformed = await request(app.getHttpServer())
      .post('/api/v1/auth/activate')
      .set('Host', host)
      .set('Origin', origin)
      .send({ password: approvedPassword, token: 'malformed-token' })
      .expect(400);
    expect(malformed.body.error).toMatchObject({
      code: 'INVALID_REQUEST',
      details: [],
    });

    const oldCreatedAt = new Date(Date.now() - 24 * 60 * 60 * 1000 - 10);
    const cases: Array<() => Promise<string>> = [
      () => createInvitation(0x31, { createdAt: oldCreatedAt }),
      () => createInvitation(0x32, { consumedAt: new Date() }),
      () => createInvitation(0x33, { invalidatedAt: new Date() }),
    ];

    for (const arrange of cases) {
      await client.userInvitation.deleteMany();
      const token = await arrange();
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/activate')
        .set('Host', host)
        .set('Origin', origin)
        .send({ password: approvedPassword, token });
      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({
        code: 'ACTIVATION_FAILED',
        details: [],
      });
      expect(response.text).not.toContain(token);
    }
    expect(await client.session.count()).toBe(0);
    expect(await client.passwordCredential.count()).toBe(0);
  });

  it('allows exactly one concurrent activation of an invitation', async () => {
    const token = await createInvitation(0x41);
    const activate = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/activate')
        .set('Host', host)
        .set('Origin', origin)
        .send({ password: approvedPassword, token });
    const responses = await Promise.all([activate(), activate()]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 400]);
    expect(await client.passwordCredential.count()).toBe(1);
    expect(await client.session.count()).toBe(1);
  });

  it('makes invalid login categories externally indistinguishable', async () => {
    const hasher = new Argon2PasswordHasher();
    const passwordHash = await hasher.hash(approvedPassword);
    const revokedAt = new Date();
    const users = await Promise.all([
      client.user.create({
        data: {
          displayName: 'Pending controlled user',
          loginIdentifier: 'pending_controlled',
          passwordCredential: { create: { passwordHash } },
        },
      }),
      client.user.create({
        data: {
          displayName: 'Disabled controlled user',
          loginIdentifier: 'disabled_controlled',
          status: 'DISABLED',
          passwordCredential: { create: { passwordHash } },
        },
      }),
      client.user.create({
        data: {
          activatedAt: new Date(),
          displayName: 'No credential controlled user',
          loginIdentifier: 'missing_credential',
          status: 'ACTIVE',
        },
      }),
      client.user.create({
        data: {
          activatedAt: new Date(),
          displayName: 'Revoked credential controlled user',
          loginIdentifier: 'revoked_credential',
          status: 'ACTIVE',
          passwordCredential: {
            create: {
              createdAt: revokedAt,
              passwordChangedAt: revokedAt,
              passwordHash,
              revokedAt,
              revokeReason: 'CONTROLLED_TEST',
            },
          },
        },
      }),
      client.user.create({
        data: {
          activatedAt: new Date(),
          displayName: 'Wrong password controlled user',
          loginIdentifier: 'wrong_password',
          status: 'ACTIVE',
          passwordCredential: { create: { passwordHash } },
        },
      }),
    ]);
    expect(users).toHaveLength(5);

    const cases = [
      ['does_not_exist', approvedPassword],
      ['pending_controlled', approvedPassword],
      ['disabled_controlled', approvedPassword],
      ['missing_credential', approvedPassword],
      ['revoked_credential', approvedPassword],
      ['wrong_password', 'incorrect controlled password'],
    ] as const;
    const publicErrors: Array<{
      code: string;
      message: string;
      status: number;
    }> = [];
    for (const [identifier, password] of cases) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Host', host)
        .set('Origin', origin)
        .send({ identifier, password });
      publicErrors.push({
        code: String(response.body.error.code),
        message: String(response.body.error.message),
        status: response.status,
      });
      expect(response.body.error.details).toEqual([]);
      expect(response.text).not.toContain(identifier);
      expect(response.text).not.toContain(password);
    }
    expect(new Set(publicErrors.map((value) => JSON.stringify(value)))).toEqual(
      new Set([
        JSON.stringify({
          code: 'AUTHENTICATION_FAILED',
          message: 'No fue posible autenticar la solicitud.',
          status: 401,
        }),
      ]),
    );
    expect(await client.session.count()).toBe(0);
  }, 30_000);

  it('logs in, persists four failures before delays and blocks without disclosing state', async () => {
    await activateDylan(0x51);
    await client.session.deleteMany();

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Host', host)
        .set('Origin', origin)
        .send({ identifier: 'dylan', password: 'incorrect password phrase' })
        .expect(401);
      const throttle = await client.loginThrottle.findFirstOrThrow({
        where: { normalizedIdentifier: 'dylan' },
      });
      expect(throttle.failedAttemptCount).toBe(attempt);
    }
    const blocked = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', host)
      .set('Origin', origin)
      .send({ identifier: 'dylan', password: approvedPassword })
      .expect(401);
    expect(blocked.body.error.code).toBe('AUTHENTICATION_FAILED');
    expect(blocked.text).not.toMatch(/blocked|attempt|until/iu);

    await client.loginThrottle.deleteMany();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', host)
      .set('Origin', origin)
      .send({ identifier: ' DYLAN ', password: approvedPassword })
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(login.body.data.csrfToken).toMatch(/^v1\./u);
    expect(login.body.data).not.toHaveProperty('token');
    expect(await client.loginThrottle.findFirst()).toBeNull();
  }, 30_000);

  it('returns the current user, sorted effective permissions and a derived CSRF token without roles', async () => {
    const authentication = await activateDylan(0x61);
    const session = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Host', host)
      .set('Cookie', authentication.cookie)
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(session.body.data).toMatchObject({
      displayName: 'Dylan',
      identifier: 'dylan',
      status: 'ACTIVE',
      userId: dylanId,
    });
    expect(session.body.data.permissions).toEqual(
      [...session.body.data.permissions].sort(),
    );
    expect(session.body.data.permissions).toContain('users.status.manage');
    expect(session.body.data.permissions).not.toContain('transfers.create');
    expect(session.body.data).not.toHaveProperty('roles');

    const csrf = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Host', host)
      .set('Cookie', authentication.cookie)
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(csrf.body.data.csrfToken).toBe(authentication.csrfToken);
    const persistedSession = await client.session.findFirstOrThrow({
      where: { userId: dylanId, revokedAt: null },
    });
    expect(new Date(csrf.body.data.expiresAt).getTime()).toBe(
      Math.min(
        persistedSession.idleExpiresAt.getTime(),
        persistedSession.absoluteExpiresAt.getTime(),
      ),
    );
  });

  it('returns the exact deterministic permission matrix for all four initial users', async () => {
    const expectedPermissions = {
      dylan: [
        'closings.create',
        'closings.read',
        'closings.reopen',
        'finances.manual.create',
        'finances.read',
        'inventory.adjust',
        'sales.cancel',
        'sales.confirm_in_transit',
        'sales.create',
        'users.credentials.revoke',
        'users.invitations.create',
        'users.sessions.revoke',
        'users.status.manage',
      ],
      jean: ['inventory.adjust', 'sales.confirm_in_transit', 'sales.create'],
      luden: ['inventory.adjust', 'sales.confirm_in_transit', 'sales.create'],
      samantha: [
        'closings.create',
        'closings.read',
        'closings.reopen',
        'finances.manual.create',
        'finances.read',
        'inventory.adjust',
        'sales.confirm_in_transit',
        'sales.create',
      ],
    } as const;
    const authentications = [];
    for (const [identifier, byte] of [
      ['dylan', 0xb1],
      ['samantha', 0xb2],
      ['jean', 0xb3],
      ['luden', 0xb4],
    ] as const) {
      authentications.push(await activateUser(identifier, byte));
    }
    const ungrantedPermission = await client.permission.create({
      data: {
        code: 'tests.phase3b.ungranted',
        description: 'Controlled ungranted permission for acceptance testing.',
      },
    });

    try {
      for (const [index, identifier] of [
        'dylan',
        'samantha',
        'jean',
        'luden',
      ].entries()) {
        const authentication = authentications[index];
        if (!authentication) throw new Error('Missing authentication fixture.');
        const response = await request(app.getHttpServer())
          .get('/api/v1/auth/session')
          .set('Host', host)
          .set('Cookie', authentication.cookie)
          .expect(200);
        const permissions = response.body.data.permissions as string[];
        expect(response.body.data).toMatchObject({
          identifier,
          userId: authentication.userId,
        });
        expect(permissions).toEqual(
          expectedPermissions[identifier as keyof typeof expectedPermissions],
        );
        expect(permissions).toEqual([...permissions].sort());
        expect(permissions).not.toContain('transfers.create');
        expect(permissions).not.toContain(ungrantedPermission.code);
        expect(response.body.data).not.toHaveProperty('roles');
        expect(response.text).not.toContain('"roles"');
      }
    } finally {
      await client.permission.delete({ where: { id: ungrantedPermission.id } });
    }
  }, 30_000);

  it('keeps only the approved health and authentication entry routes public', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Host', host)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/ready')
      .set('Host', host)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/activate')
      .set('Host', host)
      .set('Origin', origin)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', host)
      .set('Origin', origin)
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Host', host)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Host', host)
      .expect(401);
    for (const route of [
      '/api/v1/auth/logout',
      '/api/v1/auth/change-password',
      '/api/v1/auth/sessions/revoke-all',
      `/api/v1/users/${dylanId}/invitations`,
      `/api/v1/users/${dylanId}/credentials/revoke`,
      `/api/v1/users/${dylanId}/sessions/revoke`,
      `/api/v1/users/${dylanId}/deactivate`,
    ]) {
      await request(app.getHttpServer())
        .post(route)
        .set('Host', host)
        .set('Origin', origin)
        .send({})
        .expect(401);
    }

    for (const route of ['/api/docs', '/api/v1/docs']) {
      const swagger = await request(app.getHttpServer())
        .get(route)
        .set('Host', host);
      expect(swagger.status).not.toBe(200);
      expect(swagger.text).not.toContain('swagger-ui');
    }
  });

  it('requires allowed Origin publicly and CSRF on authenticated mutations', async () => {
    const token = await createInvitation(0x71);
    const missingOrigin = await request(app.getHttpServer())
      .post('/api/v1/auth/activate')
      .set('Host', host)
      .send({ password: approvedPassword, token })
      .expect(403);
    expect(missingOrigin.body.error.code).toBe('REQUEST_VERIFICATION_FAILED');
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', host)
      .set('Origin', 'http://evil.test')
      .send({ identifier: 'dylan', password: approvedPassword })
      .expect(403);

    await client.userInvitation.deleteMany();
    const authentication = await activateDylan(0x72);
    const missingCsrf = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', authentication.cookie)
      .expect(403);
    expect(missingCsrf.body.error.code).toBe('REQUEST_VERIFICATION_FAILED');
    expect(await client.session.count({ where: { revokedAt: null } })).toBe(1);
  });

  it('logs out once, clears its cookie and rejects a sequential retry', async () => {
    const authentication = await activateDylan(0x81);
    const first = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', authentication.cookie)
      .set('X-CSRF-Token', authentication.csrfToken)
      .expect(204);
    expect(String(first.headers['set-cookie'])).toContain(
      'sgi_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    );
    const second = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', authentication.cookie)
      .set('X-CSRF-Token', authentication.csrfToken)
      .expect(401);
    expect(second.body.error.code).toBe('SESSION_INVALID');
    expect(
      await client.auditLog.count({ where: { action: 'AUTH_LOGOUT' } }),
    ).toBe(1);
  });

  it('changes the password, revokes every session, clears the cookie and requires a new login', async () => {
    const authentication = await activateDylan(0x91);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', host)
      .set('Origin', origin)
      .send({ identifier: 'dylan', password: approvedPassword })
      .expect(200);
    expect(await client.session.count({ where: { revokedAt: null } })).toBe(2);

    const wrongCurrent = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', authentication.cookie)
      .set('X-CSRF-Token', authentication.csrfToken)
      .send({
        currentPassword: 'controlled incorrect phrase',
        newPassword: changedPassword,
      })
      .expect(401);
    expect(wrongCurrent.body.error.code).toBe('AUTHENTICATION_FAILED');

    const rejectedPolicy = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', authentication.cookie)
      .set('X-CSRF-Token', authentication.csrfToken)
      .send({ currentPassword: approvedPassword, newPassword: 'password1234' })
      .expect(422);
    expect(rejectedPolicy.body.error.code).toBe('PASSWORD_POLICY_REJECTED');
    expect(rejectedPolicy.text).not.toContain('password1234');

    const changed = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', authentication.cookie)
      .set('X-CSRF-Token', authentication.csrfToken)
      .send({ currentPassword: approvedPassword, newPassword: changedPassword })
      .expect(204);
    expect(String(changed.headers['set-cookie'])).toContain('sgi_session=;');
    expect(await client.session.count({ where: { revokedAt: null } })).toBe(0);
    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Host', host)
      .set('Cookie', authentication.cookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', host)
      .set('Origin', origin)
      .send({ identifier: 'dylan', password: changedPassword })
      .expect(200);
  }, 30_000);

  it('revokes all own sessions without affecting another user and rejects a sequential retry', async () => {
    const authentication = await activateDylan(0xa1);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', host)
      .set('Origin', origin)
      .send({ identifier: 'dylan', password: approvedPassword })
      .expect(200);
    const other = await client.user.create({
      data: {
        activatedAt: new Date(),
        displayName: 'Other session owner',
        loginIdentifier: `other_${Date.now()}`,
        status: 'ACTIVE',
      },
    });
    const otherToken = new AuthTokenService().generate();
    const otherSessionCreatedAt = new Date();
    await client.session.create({
      data: {
        absoluteExpiresAt: new Date(
          otherSessionCreatedAt.getTime() + 8 * 60 * 60 * 1000,
        ),
        createdAt: otherSessionCreatedAt,
        idleExpiresAt: new Date(
          otherSessionCreatedAt.getTime() + 30 * 60 * 1000,
        ),
        lastSeenAt: otherSessionCreatedAt,
        tokenHash: otherToken.tokenHash,
        userId: other.id,
      },
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/sessions/revoke-all')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', authentication.cookie)
      .set('X-CSRF-Token', authentication.csrfToken)
      .expect(204);
    expect(
      await client.session.count({
        where: { userId: dylanId, revokedAt: null },
      }),
    ).toBe(0);
    expect(
      await client.session.count({
        where: { userId: other.id, revokedAt: null },
      }),
    ).toBe(1);
    await request(app.getHttpServer())
      .post('/api/v1/auth/sessions/revoke-all')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', authentication.cookie)
      .set('X-CSRF-Token', authentication.csrfToken)
      .expect(401);
  });

  it('rejects expired and revoked sessions and sanitizes DTO failures', async () => {
    const generated = new AuthTokenService().generate();
    const rawToken = generated.secret.revealOnce();
    await client.user.update({
      where: { id: dylanId },
      data: { activatedAt: new Date(), status: 'ACTIVE' },
    });
    const createdAt = new Date(Date.now() - 9 * 60 * 60 * 1000);
    const absoluteExpiresAt = new Date(
      createdAt.getTime() + 8 * 60 * 60 * 1000,
    );
    await client.session.create({
      data: {
        absoluteExpiresAt,
        createdAt,
        idleExpiresAt: new Date(createdAt.getTime() + 30 * 60 * 1000),
        lastSeenAt: createdAt,
        tokenHash: generated.tokenHash,
        userId: dylanId,
      },
    });
    const expired = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Host', host)
      .set('Cookie', `sgi_session=${rawToken}`)
      .expect(401);
    expect(expired.body.error.code).toBe('SESSION_INVALID');
    expect(expired.text).not.toContain(rawToken);

    const revoked = new AuthTokenService().generate();
    const revokedRawToken = revoked.secret.revealOnce();
    const revokedCreatedAt = new Date();
    await client.session.create({
      data: {
        absoluteExpiresAt: new Date(
          revokedCreatedAt.getTime() + 8 * 60 * 60 * 1000,
        ),
        createdAt: revokedCreatedAt,
        idleExpiresAt: new Date(revokedCreatedAt.getTime() + 30 * 60 * 1000),
        lastSeenAt: revokedCreatedAt,
        revokeReason: 'CONTROLLED_TEST',
        revokedAt: revokedCreatedAt,
        tokenHash: revoked.tokenHash,
        userId: dylanId,
      },
    });
    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Host', host)
      .set('Cookie', `sgi_session=${revokedRawToken}`)
      .expect(401);

    const invalidDto = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', host)
      .set('Origin', origin)
      .send({
        identifier: 'x'.repeat(65),
        password: 'controlled password',
        unexpected: true,
      })
      .expect(400);
    expect(invalidDto.body.error).toMatchObject({
      code: 'INVALID_REQUEST',
      details: [],
    });
    expect(invalidDto.text).not.toContain('unexpected');
  });
});
