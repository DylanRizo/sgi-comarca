import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthTokenService } from '../src/auth/infrastructure/auth-token.service.js';
import { createApplication } from '../src/bootstrap.js';
import { runBootstrap } from '../../../packages/database/src/bootstrap/run-bootstrap.js';

const sharedDatabaseUrl = process.env.DATABASE_URL;
if (!sharedDatabaseUrl) {
  throw new Error('Integration database setup did not provide DATABASE_URL.');
}

const execFileAsync = promisify(execFile);
const approvedPassword = 'calm river orchard lantern';
const host = 'localhost:3001';
const origin = 'http://localhost:3000';
type AuthenticatedBrowser = {
  cookie: string;
  csrfToken: string;
  userId: string;
};

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

describe.sequential('BLOQUE 7A user administration HTTP endpoints', () => {
  let administrator!: DatabaseClient;
  let client!: DatabaseClient;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let databaseName: string;
  let dylanId: string;
  let samanthaId: string;
  let jeanId: string;
  let ludenId: string;
  let invitationSequence = 0x20;
  const originalEnvironment = { ...process.env };

  beforeAll(async () => {
    const source = new URL(sharedDatabaseUrl);
    databaseName =
      'sgi_block7a_' +
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
      0x71,
    ).toString('base64');
    process.env.AUTH_CSRF_HMAC_SECRET_BASE64 = Buffer.alloc(32, 0x72).toString(
      'base64',
    );
    client = createDatabaseClient(isolatedUrl.toString());
    await runBootstrap(client);
    const users = await client.user.findMany({
      select: { id: true, loginIdentifier: true },
    });
    const idFor = (identifier: string): string => {
      const id = users.find(
        ({ loginIdentifier }) => loginIdentifier === identifier,
      )?.id;
      if (!id) throw new Error(`Missing bootstrap user ${identifier}.`);
      return id;
    };
    dylanId = idFor('dylan');
    samanthaId = idFor('samantha');
    jeanId = idFor('jean');
    ludenId = idFor('luden');
    app = await createApplication();
    await app.init();
  }, 120_000);

  beforeEach(async () => {
    await client.session.deleteMany();
    await client.userInvitation.deleteMany();
    await client.passwordCredential.deleteMany();
    await client.loginThrottle.deleteMany();
    await client.userPermission.deleteMany({
      where: { effect: 'DENY' },
    });
    await Promise.all([
      client.user.update({
        where: { id: dylanId },
        data: {
          activatedAt: null,
          displayName: 'Dylan',
          loginIdentifier: 'dylan',
          status: 'PENDING_ACTIVATION',
        },
      }),
      client.user.update({
        where: { id: samanthaId },
        data: {
          activatedAt: null,
          displayName: 'Samantha',
          loginIdentifier: 'samantha',
          status: 'PENDING_ACTIVATION',
        },
      }),
      client.user.update({
        where: { id: jeanId },
        data: {
          activatedAt: null,
          displayName: 'Jean',
          loginIdentifier: 'jean',
          status: 'PENDING_ACTIVATION',
        },
      }),
      client.user.update({
        where: { id: ludenId },
        data: {
          activatedAt: null,
          displayName: 'Luden',
          loginIdentifier: 'luden',
          status: 'PENDING_ACTIVATION',
        },
      }),
    ]);
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

  async function createInvitation(userId: string): Promise<string> {
    invitationSequence += 1;
    const token = controlledToken(invitationSequence);
    const tokenHash = new AuthTokenService().hashValidatedToken(token);
    if (!tokenHash) throw new Error('Controlled invitation token is invalid.');
    const createdAt = new Date();
    await client.userInvitation.create({
      data: {
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
        tokenHash,
        userId,
      },
    });
    return token;
  }

  async function activate(
    userId: string,
    identifier: string,
  ): Promise<AuthenticatedBrowser> {
    const token = await createInvitation(userId);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/activate')
      .set('Host', host)
      .set('Origin', origin)
      .send({ password: approvedPassword, token })
      .expect(201);
    expect(response.body.data.user.identifier).toBe(identifier);
    return {
      cookie: cookieFrom(response),
      csrfToken: String(response.body.data.csrfToken),
      userId,
    };
  }

  async function admin(): Promise<AuthenticatedBrowser> {
    return activate(dylanId, 'dylan');
  }

  function command(
    browser: AuthenticatedBrowser,
    path: string,
    body: Record<string, unknown> = {},
  ): request.Test {
    return request(app.getHttpServer())
      .post(path)
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', browser.cookie)
      .set('X-CSRF-Token', browser.csrfToken)
      .send(body);
  }

  async function addDeny(
    userId: string,
    permissionCode: string,
  ): Promise<void> {
    const permission = await client.permission.findUniqueOrThrow({
      where: { code: permissionCode },
      select: { id: true },
    });
    await client.userPermission.create({
      data: {
        effect: 'DENY',
        grantedByUserId: dylanId,
        permissionId: permission.id,
        userId,
      },
    });
  }

  async function createSession(userId: string): Promise<void> {
    const token = new AuthTokenService().generate();
    const now = new Date();
    await client.session.create({
      data: {
        absoluteExpiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
        createdAt: now,
        idleExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
        lastSeenAt: now,
        tokenHash: token.tokenHash,
        userId,
      },
    });
  }

  it('authorizes only effective PostgreSQL permissions, including direct DENY', async () => {
    const dylan = await admin();
    const routes = [
      {
        path: `/api/v1/users/${samanthaId}/invitations`,
        permission: 'users.invitations.create',
        success: 201,
      },
      {
        path: `/api/v1/users/${samanthaId}/credentials/revoke`,
        permission: 'users.credentials.revoke',
        success: 204,
      },
      {
        path: `/api/v1/users/${samanthaId}/sessions/revoke`,
        permission: 'users.sessions.revoke',
        success: 204,
      },
      {
        path: `/api/v1/users/${samanthaId}/deactivate`,
        permission: 'users.status.manage',
        success: 204,
      },
    ] as const;

    for (const route of routes) {
      await client.user.update({
        where: { id: samanthaId },
        data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
      });
      await client.userInvitation.deleteMany({ where: { userId: samanthaId } });
      await addDeny(dylanId, route.permission);
      await command(dylan, route.path).expect(403);
      await client.userPermission.updateMany({
        where: {
          effect: 'DENY',
          permission: { code: route.permission },
          revokedAt: null,
          userId: dylanId,
        },
        data: { revokedAt: new Date(), revokedByUserId: dylanId },
      });
      await command(dylan, route.path).expect(route.success);
    }

    for (const [userId, identifier] of [
      [samanthaId, 'samantha'],
      [jeanId, 'jean'],
      [ludenId, 'luden'],
    ] as const) {
      await client.user.update({
        where: { id: userId },
        data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
      });
      await client.userInvitation.deleteMany({ where: { userId } });
      const browser = await activate(userId, identifier);
      await command(browser, `/api/v1/users/${dylanId}/sessions/revoke`).expect(
        403,
      );
    }

    await client.user.update({
      where: { id: dylanId },
      data: {
        displayName: 'Renamed administrator',
        loginIdentifier: 'owner-x',
      },
    });
    await command(dylan, `/api/v1/users/${jeanId}/sessions/revoke`).expect(204);
  });

  it('creates and regenerates a 24-hour hash-only invitation after commit', async () => {
    const dylan = await admin();
    const previousToken = await createInvitation(samanthaId);
    const response = await command(
      dylan,
      `/api/v1/users/${samanthaId}/invitations`,
    )
      .set('X-Request-ID', 'block-7a-invitation')
      .expect(201)
      .expect('Cache-Control', 'no-store');
    expect(response.body).toMatchObject({
      data: { token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u) },
      meta: { requestId: 'block-7a-invitation' },
    });
    const token = String(response.body.data.token);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);

    const invitations = await client.userInvitation.findMany({
      where: { userId: samanthaId },
      orderBy: { createdAt: 'asc' },
    });
    expect(invitations).toHaveLength(2);
    const previous = invitations[0];
    const current = invitations[1];
    if (!previous || !current) {
      throw new Error('Invitation regeneration did not preserve both rows.');
    }
    expect(previous).toMatchObject({
      invalidatedByUserId: dylanId,
      invalidationReason: 'REPLACED_BY_ADMINISTRATIVE_INVITATION',
    });
    expect(current.createdByUserId).toBe(dylanId);
    expect(current.expiresAt.getTime() - current.createdAt.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
    expect(current.tokenHash).toBe(
      new AuthTokenService().hashValidatedToken(token),
    );
    expect(current.tokenHash).not.toBe(token);

    const persisted = JSON.stringify({
      audits: await client.auditLog.findMany({
        where: { action: 'ADMIN_INVITATION_CREATED' },
        select: { metadata: true },
      }),
      invitations,
    });
    expect(persisted).not.toContain(token);
    expect(persisted).not.toContain(previousToken);

    const regenerated = await command(
      dylan,
      `/api/v1/users/${samanthaId}/invitations`,
    ).expect(201);
    expect(regenerated.body.data.token).not.toBe(token);
    expect(
      await client.userInvitation.count({
        where: {
          consumedAt: null,
          invalidatedAt: null,
          userId: samanthaId,
        },
      }),
    ).toBe(1);
  });

  it('maps invalid invitation targets, bodies and states without internal detail', async () => {
    const dylan = await admin();
    await command(dylan, '/api/v1/users/not-a-uuid/invitations').expect(400);
    await command(dylan, `/api/v1/users/${randomUUID()}/invitations`).expect(
      404,
    );
    await command(dylan, `/api/v1/users/${samanthaId}/invitations`, {
      unexpected: true,
    }).expect(400);

    await client.user.update({
      where: { id: samanthaId },
      data: { activatedAt: new Date(), status: 'ACTIVE' },
    });
    const active = await command(
      dylan,
      `/api/v1/users/${samanthaId}/invitations`,
    ).expect(409);
    expect(active.body.error.code).toBe('ADMIN_USER_STATE_CONFLICT');
    expect(JSON.stringify(active.body)).not.toMatch(/sql|prisma|hash|role/iu);

    await client.user.update({
      where: { id: samanthaId },
      data: { status: 'DISABLED' },
    });
    await command(dylan, `/api/v1/users/${samanthaId}/invitations`).expect(409);
  });

  it('returns one explicit conflict for overlapping invitation generation', async () => {
    const dylan = await admin();
    let releaseTargetLock!: () => void;
    let targetLocked!: () => void;
    const targetLockReady = new Promise<void>((resolve) => {
      targetLocked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseTargetLock = resolve;
    });
    const blocker = client.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id FROM users WHERE id = ${samanthaId}::uuid FOR UPDATE
      `;
      targetLocked();
      await release;
    });
    await targetLockReady;

    const first = command(dylan, `/api/v1/users/${samanthaId}/invitations`);
    const firstResponse = first.then((response) => response);

    const lockDeadline = Date.now() + 5_000;
    while (Date.now() < lockDeadline) {
      const locks = await client.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM pg_locks
        WHERE locktype = 'advisory' AND granted
      `;
      if ((locks[0]?.count ?? 0n) > 0n) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    try {
      const conflicting = await command(
        dylan,
        `/api/v1/users/${samanthaId}/invitations`,
      ).expect(409);
      expect(conflicting.body.error.code).toBe('ADMIN_OPERATION_CONFLICT');
    } finally {
      releaseTargetLock();
    }
    await blocker;
    const successful = await firstResponse;
    expect(successful.status).toBe(201);
    expect(
      await client.userInvitation.count({
        where: { invalidatedAt: null, userId: samanthaId },
      }),
    ).toBe(1);
  });

  it('revokes a credential and sessions atomically without creating an invitation', async () => {
    const dylan = await admin();
    await activate(samanthaId, 'samantha');
    await createSession(samanthaId);
    const credentialBefore = await client.passwordCredential.findUniqueOrThrow({
      where: { userId: samanthaId },
    });
    const invitationsBefore = await client.userInvitation.count({
      where: { userId: samanthaId },
    });
    const auditsBefore = await client.auditLog.count({
      where: { action: 'ADMIN_CREDENTIAL_REVOKED', entityId: samanthaId },
    });

    await command(dylan, `/api/v1/users/${samanthaId}/credentials/revoke`)
      .expect(204)
      .expect('Cache-Control', 'no-store');

    const user = await client.user.findUniqueOrThrow({
      where: { id: samanthaId },
    });
    const credential = await client.passwordCredential.findUniqueOrThrow({
      where: { userId: samanthaId },
    });
    expect(user).toMatchObject({
      activatedAt: null,
      status: 'PENDING_ACTIVATION',
    });
    expect(credential.id).toBe(credentialBefore.id);
    expect(credential.revokedAt).toBeInstanceOf(Date);
    expect(credential.revokedByUserId).toBe(dylanId);
    expect(credential.revokeReason).toBe('ADMINISTRATIVE_REVOCATION');
    expect(
      await client.session.count({
        where: { revokedAt: null, userId: samanthaId },
      }),
    ).toBe(0);
    expect(
      await client.userInvitation.count({ where: { userId: samanthaId } }),
    ).toBe(invitationsBefore);
    const auditCount = await client.auditLog.count({
      where: { action: 'ADMIN_CREDENTIAL_REVOKED', entityId: samanthaId },
    });
    expect(auditCount).toBe(auditsBefore + 1);

    await command(
      dylan,
      `/api/v1/users/${samanthaId}/credentials/revoke`,
    ).expect(204);
    expect(
      await client.auditLog.count({
        where: { action: 'ADMIN_CREDENTIAL_REVOKED', entityId: samanthaId },
      }),
    ).toBe(auditCount);
  });

  it('protects the last enabled ADMIN even when another actor has direct permission', async () => {
    await admin();
    const samantha = await activate(samanthaId, 'samantha');
    const permissions = await client.permission.findMany({
      where: {
        code: { in: ['users.credentials.revoke', 'users.status.manage'] },
      },
      select: { id: true },
    });
    const directGrants = await Promise.all(
      permissions.map(({ id: permissionId }) =>
        client.userPermission.create({
          data: {
            effect: 'GRANT',
            grantedByUserId: dylanId,
            permissionId,
            userId: samanthaId,
          },
        }),
      ),
    );
    const credential = await command(
      samantha,
      `/api/v1/users/${dylanId}/credentials/revoke`,
    ).expect(409);
    expect(credential.body.error.code).toBe('LAST_ADMIN_PROTECTED');
    const deactivate = await command(
      samantha,
      `/api/v1/users/${dylanId}/deactivate`,
    ).expect(409);
    expect(deactivate.body.error.code).toBe('LAST_ADMIN_PROTECTED');
    expect(
      await client.user.findUniqueOrThrow({ where: { id: dylanId } }),
    ).toMatchObject({ status: 'ACTIVE' });
    expect(
      await client.passwordCredential.findUniqueOrThrow({
        where: { userId: dylanId },
      }),
    ).toMatchObject({ revokedAt: null });
    await client.userPermission.deleteMany({
      where: { id: { in: directGrants.map(({ id }) => id) } },
    });
  });

  it('revokes only target sessions, permits the last ADMIN and audits real changes', async () => {
    const dylan = await admin();
    await client.user.updateMany({
      where: { id: { in: [samanthaId, jeanId] } },
      data: { activatedAt: new Date(), status: 'ACTIVE' },
    });
    await createSession(samanthaId);
    await createSession(samanthaId);
    await createSession(jeanId);
    const auditsBefore = await client.auditLog.count({
      where: { action: 'ADMIN_SESSIONS_REVOKED', entityId: samanthaId },
    });

    await command(dylan, `/api/v1/users/${samanthaId}/sessions/revoke`).expect(
      204,
    );
    expect(
      await client.session.count({
        where: { revokedAt: null, userId: samanthaId },
      }),
    ).toBe(0);
    expect(
      await client.session.count({
        where: { revokedAt: null, userId: jeanId },
      }),
    ).toBe(1);
    const auditCount = await client.auditLog.count({
      where: { action: 'ADMIN_SESSIONS_REVOKED', entityId: samanthaId },
    });
    expect(auditCount).toBe(auditsBefore + 1);
    await command(dylan, `/api/v1/users/${samanthaId}/sessions/revoke`).expect(
      204,
    );
    expect(
      await client.auditLog.count({
        where: { action: 'ADMIN_SESSIONS_REVOKED', entityId: samanthaId },
      }),
    ).toBe(auditCount);

    await command(dylan, `/api/v1/users/${dylanId}/sessions/revoke`).expect(
      204,
    );
    expect(
      await client.session.count({
        where: { revokedAt: null, userId: dylanId },
      }),
    ).toBe(0);
  });

  it('deactivates active or pending users and preserves credentials and activation time', async () => {
    const dylan = await admin();
    await activate(samanthaId, 'samantha');
    const activated = await client.user.findUniqueOrThrow({
      where: { id: samanthaId },
      select: { activatedAt: true },
    });
    const credential = await client.passwordCredential.findUniqueOrThrow({
      where: { userId: samanthaId },
    });
    await createInvitation(samanthaId);
    const pendingInvitation = await client.userInvitation.findFirstOrThrow({
      where: {
        consumedAt: null,
        invalidatedAt: null,
        userId: samanthaId,
      },
      orderBy: { createdAt: 'desc' },
    });
    await createSession(samanthaId);
    const auditsBefore = await client.auditLog.count({
      where: { action: 'ADMIN_USER_DEACTIVATED', entityId: samanthaId },
    });

    await command(dylan, `/api/v1/users/${samanthaId}/deactivate`).expect(204);
    expect(
      await client.user.findUniqueOrThrow({ where: { id: samanthaId } }),
    ).toMatchObject({ activatedAt: activated.activatedAt, status: 'DISABLED' });
    expect(
      await client.passwordCredential.findUniqueOrThrow({
        where: { userId: samanthaId },
      }),
    ).toMatchObject({ id: credential.id, revokedAt: null });
    expect(
      await client.session.count({
        where: { revokedAt: null, userId: samanthaId },
      }),
    ).toBe(0);
    expect(
      await client.userInvitation.count({
        where: {
          consumedAt: null,
          invalidatedAt: null,
          userId: samanthaId,
        },
      }),
    ).toBe(0);
    expect(
      await client.userInvitation.findUniqueOrThrow({
        where: { id: pendingInvitation.id },
      }),
    ).toMatchObject({
      invalidatedByUserId: dylanId,
      invalidationReason: 'USER_DISABLED',
    });
    const auditCount = await client.auditLog.count({
      where: { action: 'ADMIN_USER_DEACTIVATED', entityId: samanthaId },
    });
    expect(auditCount).toBe(auditsBefore + 1);
    await command(dylan, `/api/v1/users/${samanthaId}/deactivate`).expect(204);
    expect(
      await client.auditLog.count({
        where: { action: 'ADMIN_USER_DEACTIVATED', entityId: samanthaId },
      }),
    ).toBe(auditCount);

    await createInvitation(jeanId);
    await command(dylan, `/api/v1/users/${jeanId}/deactivate`).expect(204);
    expect(
      await client.user.findUniqueOrThrow({ where: { id: jeanId } }),
    ).toMatchObject({ activatedAt: null, status: 'DISABLED' });
  });

  it('keeps login/revocation races safe and administrative failures generic', async () => {
    const dylan = await admin();
    await activate(samanthaId, 'samantha');
    const [login, revocation] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Host', host)
        .set('Origin', origin)
        .send({ identifier: 'samantha', password: approvedPassword }),
      command(dylan, `/api/v1/users/${samanthaId}/credentials/revoke`),
    ]);
    expect([201, 401]).toContain(login.status);
    expect(revocation.status).toBe(204);
    expect(
      await client.session.count({
        where: { revokedAt: null, userId: samanthaId },
      }),
    ).toBe(0);

    await client.user.update({
      where: { id: jeanId },
      data: { status: 'DISABLED' },
    });
    const conflict = await command(
      dylan,
      `/api/v1/users/${jeanId}/credentials/revoke`,
    ).expect(409);
    expect(conflict.body.error).toMatchObject({
      code: 'ADMIN_USER_STATE_CONFLICT',
    });
    expect(JSON.stringify(conflict.body)).not.toMatch(
      /password|credentialHash|sessionHash|token|sql|prisma/iu,
    );
  });

  it('enforces session, Origin and CSRF before every administrative command', async () => {
    const path = `/api/v1/users/${samanthaId}/sessions/revoke`;
    await request(app.getHttpServer())
      .post(path)
      .set('Host', host)
      .set('Origin', origin)
      .send({})
      .expect(401)
      .expect('Cache-Control', 'no-store');

    const dylan = await admin();
    await request(app.getHttpServer())
      .post(path)
      .set('Host', host)
      .set('Origin', 'https://untrusted.example')
      .set('Cookie', dylan.cookie)
      .set('X-CSRF-Token', dylan.csrfToken)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(path)
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', dylan.cookie)
      .send({})
      .expect(403);

    const session = await client.session.findFirstOrThrow({
      where: { userId: dylanId },
      orderBy: { createdAt: 'desc' },
    });
    await client.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokeReason: 'CONTROLLED_TEST' },
    });
    await command(dylan, path).expect(401);
  });
});
