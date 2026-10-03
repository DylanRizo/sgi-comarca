import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthTokenService } from '../src/auth/infrastructure/auth-token.service.js';
import { createApplication } from '../src/bootstrap.js';
import {
  bootstrapUserPermissions,
  bootstrapUserRoles,
} from '../../../packages/database/src/bootstrap/manifest.js';
import { runBootstrap } from '../../../packages/database/src/bootstrap/run-bootstrap.js';

const sharedDatabaseUrl = process.env.DATABASE_URL;
if (!sharedDatabaseUrl) {
  throw new Error('Integration database setup did not provide DATABASE_URL.');
}

const execFileAsync = promisify(execFile);
const approvedPassword = 'calm river orchard lantern';
const host = 'localhost:3001';
const origin = 'http://localhost:3000';
type Browser = { cookie: string; csrfToken: string };

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

function cookieFrom(response: request.Response): string {
  const header = response.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error('Authentication response omitted its cookie.');
  return value.split(';')[0] ?? '';
}

/**
 * ADR-020: roles and exceptions edited from the panel, and reactivation.
 * Runs against its own temporary database so revoking and re-creating
 * assignments never leaks into another suite.
 */
describe.sequential('user access administration (ADR-020)', () => {
  let administrator!: DatabaseClient;
  let client!: DatabaseClient;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let databaseName: string;
  const ids = new Map<string, string>();
  let invitationSequence = 0x40;
  const originalEnvironment = { ...process.env };

  const id = (login: string): string => {
    const value = ids.get(login);
    if (!value) throw new Error(`Missing bootstrap user ${login}.`);
    return value;
  };

  beforeAll(async () => {
    const source = new URL(sharedDatabaseUrl);
    databaseName =
      'sgi_access_' +
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
    for (const user of await client.user.findMany({
      select: { id: true, loginIdentifier: true },
    })) {
      ids.set(user.loginIdentifier, user.id);
    }
    app = await createApplication();
    await app.init();
  }, 120_000);

  /**
   * Every case starts from the manifest's assignments, so the database is
   * physically reset rather than revoked: this temporary database owns no
   * history worth keeping.
   */
  beforeEach(async () => {
    await client.session.deleteMany();
    await client.userInvitation.deleteMany();
    await client.passwordCredential.deleteMany();
    await client.loginThrottle.deleteMany();
    await client.userRole.deleteMany();
    await client.userPermission.deleteMany();
    await client.user.updateMany({
      data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
    });
    const [roles, permissions] = await Promise.all([
      client.role.findMany({ select: { code: true, id: true } }),
      client.permission.findMany({ select: { code: true, id: true } }),
    ]);
    const roleId = new Map(roles.map(({ code, id: value }) => [code, value]));
    const permissionId = new Map(
      permissions.map(({ code, id: value }) => [code, value]),
    );
    await client.userRole.createMany({
      data: bootstrapUserRoles.map(({ loginIdentifier, roleCode }) => ({
        roleId: roleId.get(roleCode) ?? '',
        userId: id(loginIdentifier),
      })),
    });
    await client.userPermission.createMany({
      data: bootstrapUserPermissions.map(
        ({ loginIdentifier, permissionCode }) => ({
          permissionId: permissionId.get(permissionCode) ?? '',
          userId: id(loginIdentifier),
        }),
      ),
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

  async function signIn(login: string): Promise<Browser> {
    invitationSequence += 1;
    const token = Buffer.alloc(32, invitationSequence).toString('base64url');
    const tokenHash = new AuthTokenService().hashValidatedToken(token);
    if (!tokenHash) throw new Error('Controlled invitation token is invalid.');
    const createdAt = new Date();
    await client.userInvitation.create({
      data: {
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
        tokenHash,
        userId: id(login),
      },
    });
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

  function send(
    browser: Browser,
    method: 'post' | 'put',
    path: string,
    body: Record<string, unknown> = {},
  ): request.Test {
    return request(app.getHttpServer())
      [method](path)
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', browser.cookie)
      .set('X-CSRF-Token', browser.csrfToken)
      .send(body);
  }

  function read(browser: Browser, path: string): request.Test {
    return request(app.getHttpServer())
      .get(path)
      .set('Host', host)
      .set('Cookie', browser.cookie);
  }

  const putRoles = (browser: Browser, login: string, roleCodes: string[]) =>
    send(browser, 'put', `/api/v1/users/${id(login)}/roles`, { roleCodes });

  const putOverrides = (
    browser: Browser,
    login: string,
    overrides: { code: string; effect: 'DENY' | 'GRANT' }[],
  ) =>
    send(browser, 'put', `/api/v1/users/${id(login)}/permissions`, {
      overrides,
    });

  async function activeRoles(login: string): Promise<string[]> {
    const rows = await client.userRole.findMany({
      where: { revokedAt: null, userId: id(login) },
      select: { role: { select: { code: true } } },
    });
    return rows.map(({ role }) => role.code).sort();
  }

  async function activeOverrides(login: string): Promise<string[]> {
    const rows = await client.userPermission.findMany({
      where: { revokedAt: null, userId: id(login) },
      select: { effect: true, permission: { select: { code: true } } },
    });
    return rows
      .map(({ effect, permission }) => `${permission.code}:${effect}`)
      .sort();
  }

  const auditCount = (action: string) =>
    client.auditLog.count({ where: { action } });

  it('authorizes each command by its exact permission, CSRF and Origin', async () => {
    const dylan = await signIn('dylan');
    const jean = await signIn('jean');

    // Jean manages inventory and sales but administers nobody.
    await putRoles(jean, 'luden', ['SALES']).expect(403);
    await putOverrides(jean, 'luden', []).expect(403);
    await send(jean, 'post', `/api/v1/users/${id('luden')}/reactivate`).expect(
      403,
    );
    await read(jean, '/api/v1/permissions').expect(403);

    // A direct DENY wins over the ADMIN role's grant.
    const rolesManage = await client.permission.findUniqueOrThrow({
      where: { code: 'users.roles.manage' },
    });
    const deny = await client.userPermission.create({
      data: {
        effect: 'DENY',
        permissionId: rolesManage.id,
        userId: id('dylan'),
      },
    });
    await putRoles(dylan, 'jean', ['SALES']).expect(403);
    await client.userPermission.delete({ where: { id: deny.id } });

    await request(app.getHttpServer())
      .put(`/api/v1/users/${id('jean')}/roles`)
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', dylan.cookie)
      .send({ roleCodes: ['SALES'] })
      .expect(403);
    await request(app.getHttpServer())
      .put(`/api/v1/users/${id('jean')}/roles`)
      .set('Host', host)
      .set('Origin', 'https://attacker.example')
      .set('Cookie', dylan.cookie)
      .set('X-CSRF-Token', dylan.csrfToken)
      .send({ roleCodes: ['SALES'] })
      .expect(403);

    expect(await activeRoles('jean')).toEqual(['INVENTORY_MANAGER', 'SALES']);
  });

  it('replaces roles, keeps history, audits once and takes effect at once', async () => {
    const dylan = await signIn('dylan');
    const jean = await signIn('jean');
    // Jean holds no finance permission yet, in this same session.
    await read(jean, '/api/v1/finances').expect(403);
    const auditBefore = await auditCount('ADMIN_USER_ROLES_CHANGED');

    const response = await putRoles(dylan, 'jean', ['SALES', 'FINANCE']).expect(
      200,
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.roles).toEqual(['FINANCE', 'SALES']);
    expect(response.body.data.effectivePermissions).toContain('finances.read');
    expect(response.body.data.effectivePermissions).not.toContain(
      'inventory.read',
    );

    // No re-login: permissions are evaluated against PostgreSQL per request.
    await read(jean, '/api/v1/finances').expect(200);
    await read(jean, '/api/v1/inventory').expect(403);

    const history = await client.userRole.findMany({
      where: { userId: id('jean') },
      select: {
        grantedByUserId: true,
        revokedAt: true,
        revokedByUserId: true,
        role: { select: { code: true } },
      },
    });
    expect(
      history.find(({ role }) => role.code === 'INVENTORY_MANAGER'),
    ).toMatchObject({ revokedByUserId: id('dylan') });
    expect(history.find(({ role }) => role.code === 'FINANCE')).toMatchObject({
      grantedByUserId: id('dylan'),
      revokedAt: null,
    });

    expect(await auditCount('ADMIN_USER_ROLES_CHANGED')).toBe(auditBefore + 1);
    const audit = await client.auditLog.findFirstOrThrow({
      where: { action: 'ADMIN_USER_ROLES_CHANGED', entityId: id('jean') },
      orderBy: { occurredAt: 'desc' },
    });
    expect(audit).toMatchObject({
      actorUserId: id('dylan'),
      entityType: 'AUTHENTICATION',
      metadata: {
        addedRoles: 'FINANCE',
        operationType: 'REPLACE_ROLES',
        removedRoles: 'INVENTORY_MANAGER',
      },
    });

    // The same desired set again is a no-op: no rows, no audit.
    const rowsBefore = await client.userRole.count();
    await putRoles(dylan, 'jean', ['FINANCE', 'SALES']).expect(200);
    expect(await client.userRole.count()).toBe(rowsBefore);
    expect(await auditCount('ADMIN_USER_ROLES_CHANGED')).toBe(auditBefore + 1);

    // A live database edited from the panel still passes bootstrap untouched.
    const bootstrap = await runBootstrap(client);
    expect(Object.values(bootstrap.created).every((count) => count === 0)).toBe(
      true,
    );
    expect(await activeRoles('jean')).toEqual(['FINANCE', 'SALES']);
  });

  it('never assigns or removes ADMIN, including on the administrator', async () => {
    const dylan = await signIn('dylan');

    const assign = await putRoles(dylan, 'samantha', [
      'ADMIN',
      'FINANCE',
      'INVENTORY_MANAGER',
      'SALES',
    ]).expect(422);
    expect(assign.body.error.code).toBe('ADMIN_ROLE_NOT_EDITABLE');

    const removeOwn = await putRoles(dylan, 'dylan', ['FINANCE']).expect(422);
    expect(removeOwn.body.error.code).toBe('ADMIN_ROLE_NOT_EDITABLE');

    expect(await activeRoles('samantha')).toEqual([
      'FINANCE',
      'INVENTORY_MANAGER',
      'SALES',
    ]);
    expect(await activeRoles('dylan')).toEqual([
      'ADMIN',
      'FINANCE',
      'INVENTORY_MANAGER',
      'SALES',
    ]);

    // The administrator's other roles remain theirs to change.
    await putRoles(dylan, 'dylan', ['ADMIN', 'FINANCE']).expect(200);
    expect(await activeRoles('dylan')).toEqual(['ADMIN', 'FINANCE']);
  });

  it('rejects unknown codes, unknown users and malformed bodies', async () => {
    const dylan = await signIn('dylan');

    const unknownRole = await putRoles(dylan, 'jean', ['AUDITOR']).expect(400);
    expect(unknownRole.body.error.code).toBe('ADMIN_UNKNOWN_CODE');
    const unknownPermission = await putOverrides(dylan, 'jean', [
      { code: 'payroll.read', effect: 'GRANT' },
    ]).expect(400);
    expect(unknownPermission.body.error.code).toBe('ADMIN_UNKNOWN_CODE');

    const missing = await send(
      dylan,
      'put',
      `/api/v1/users/${randomUUID()}/roles`,
      { roleCodes: ['SALES'] },
    ).expect(404);
    expect(missing.body.error.code).toBe('ADMIN_USER_NOT_FOUND');

    await send(dylan, 'put', `/api/v1/users/${id('jean')}/roles`, {
      roleCodes: ['SALES', 'SALES'],
    }).expect(400);
    await send(dylan, 'put', `/api/v1/users/${id('jean')}/permissions`, {
      overrides: [{ code: 'sales.create', effect: 'MAYBE' }],
    }).expect(400);
    await send(dylan, 'put', '/api/v1/users/not-a-uuid/roles', {
      roleCodes: [],
    }).expect(400);

    expect(await activeRoles('jean')).toEqual(['INVENTORY_MANAGER', 'SALES']);
  });

  it('replaces exceptions, swapping an effect through revoke and insert', async () => {
    const dylan = await signIn('dylan');
    const auditBefore = await auditCount('ADMIN_USER_PERMISSIONS_CHANGED');

    const first = await putOverrides(dylan, 'luden', [
      { code: 'finances.read', effect: 'GRANT' },
      { code: 'sales.create', effect: 'DENY' },
    ]).expect(200);
    expect(first.body.data.overrides).toEqual([
      { code: 'finances.read', effect: 'GRANT' },
      { code: 'sales.create', effect: 'DENY' },
    ]);
    expect(first.body.data.effectivePermissions).toContain('finances.read');
    expect(first.body.data.effectivePermissions).not.toContain('sales.create');

    await putOverrides(dylan, 'luden', [
      { code: 'finances.read', effect: 'DENY' },
    ]).expect(200);
    expect(await activeOverrides('luden')).toEqual(['finances.read:DENY']);
    const history = await client.userPermission.findMany({
      where: { permission: { code: 'finances.read' }, userId: id('luden') },
      orderBy: { grantedAt: 'asc' },
      select: { effect: true, revokedAt: true, revokedByUserId: true },
    });
    expect(history).toHaveLength(2);
    expect(history.filter(({ revokedAt }) => revokedAt === null)).toEqual([
      { effect: 'DENY', revokedAt: null, revokedByUserId: null },
    ]);

    const audit = await client.auditLog.findFirstOrThrow({
      where: {
        action: 'ADMIN_USER_PERMISSIONS_CHANGED',
        entityId: id('luden'),
      },
      orderBy: { occurredAt: 'desc' },
    });
    expect(audit.metadata).toEqual({
      clearedPermissions: 'sales.create',
      deniedPermissions: 'finances.read',
      grantedPermissions: '',
      operationType: 'REPLACE_PERMISSIONS',
    });

    await putOverrides(dylan, 'luden', []).expect(200);
    await putOverrides(dylan, 'luden', []).expect(200);
    expect(await activeOverrides('luden')).toEqual([]);
    expect(await auditCount('ADMIN_USER_PERMISSIONS_CHANGED')).toBe(
      auditBefore + 3,
    );
  });

  it('keeps administrator-only permissions and panel access where ADR-020 puts them', async () => {
    const dylan = await signIn('dylan');

    for (const code of [
      'sales.cancel',
      'inventory.audit.approve',
      'users.roles.manage',
    ]) {
      const refused = await putOverrides(dylan, 'samantha', [
        { code, effect: 'GRANT' },
      ]).expect(422);
      expect(refused.body.error.code).toBe('ADMIN_PERMISSION_RESTRICTED');
    }
    // Denying one of them is a restriction, never a privilege.
    await putOverrides(dylan, 'samantha', [
      { code: 'sales.cancel', effect: 'DENY' },
    ]).expect(200);

    for (const code of ['users.read', 'users.roles.manage']) {
      const refused = await putOverrides(dylan, 'dylan', [
        { code: 'inventory.audit.approve', effect: 'GRANT' },
        { code: 'sales.cancel', effect: 'GRANT' },
        { code, effect: 'DENY' },
      ]).expect(422);
      expect(refused.body.error.code).toBe('ADMIN_ACCESS_PROTECTED');
    }

    // The administrator may drop and re-take their own reserved grants.
    await putOverrides(dylan, 'dylan', [
      { code: 'sales.cancel', effect: 'GRANT' },
    ]).expect(200);
    await putOverrides(dylan, 'dylan', [
      { code: 'inventory.audit.approve', effect: 'GRANT' },
      { code: 'sales.cancel', effect: 'GRANT' },
    ]).expect(200);
    expect(await activeOverrides('dylan')).toEqual([
      'inventory.audit.approve:GRANT',
      'sales.cancel:GRANT',
    ]);
    expect(await activeOverrides('samantha')).toEqual(['sales.cancel:DENY']);
  });

  it('serializes concurrent replacements so one coherent set wins', async () => {
    const dylan = await signIn('dylan');
    const responses = await Promise.all([
      putRoles(dylan, 'jean', ['FINANCE']),
      putRoles(dylan, 'jean', ['SALES', 'PARTNER']),
    ]);
    for (const response of responses) {
      expect([200, 409]).toContain(response.status);
    }
    expect(responses.some(({ status }) => status === 200)).toBe(true);
    const roles = await activeRoles('jean');
    expect([['FINANCE'], ['PARTNER', 'SALES']]).toContainEqual(roles);
  });

  it('reactivates to ACTIVE only when the credential survived', async () => {
    const dylan = await signIn('dylan');
    await signIn('samantha');
    const auditBefore = await auditCount('ADMIN_USER_REACTIVATED');

    await send(
      dylan,
      'post',
      `/api/v1/users/${id('samantha')}/deactivate`,
    ).expect(204);
    await send(
      dylan,
      'post',
      `/api/v1/users/${id('samantha')}/reactivate`,
    ).expect(204);
    expect(
      await client.user.findUniqueOrThrow({ where: { id: id('samantha') } }),
    ).toMatchObject({ status: 'ACTIVE' });
    // The preserved credential signs in again; sessions stayed revoked.
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', host)
      .set('Origin', origin)
      .send({ identifier: 'samantha', password: approvedPassword })
      .expect(200);

    // Jean never activated: back to waiting for an invitation.
    await send(dylan, 'post', `/api/v1/users/${id('jean')}/deactivate`).expect(
      204,
    );
    await send(dylan, 'post', `/api/v1/users/${id('jean')}/reactivate`).expect(
      204,
    );
    expect(
      await client.user.findUniqueOrThrow({ where: { id: id('jean') } }),
    ).toMatchObject({ activatedAt: null, status: 'PENDING_ACTIVATION' });

    // Someone who is not disabled is left as is, without audit.
    await send(dylan, 'post', `/api/v1/users/${id('jean')}/reactivate`).expect(
      204,
    );
    expect(await auditCount('ADMIN_USER_REACTIVATED')).toBe(auditBefore + 2);
    const audit = await client.auditLog.findFirstOrThrow({
      where: { action: 'ADMIN_USER_REACTIVATED', entityId: id('samantha') },
    });
    expect(audit.metadata).toEqual({
      operationType: 'REACTIVATE',
      resultingStatus: 'ACTIVE',
    });

    const missing = await send(
      dylan,
      'post',
      `/api/v1/users/${randomUUID()}/reactivate`,
    ).expect(404);
    expect(missing.body.error.code).toBe('ADMIN_USER_NOT_FOUND');
  });

  it('exposes the role and permission catalogs behind users.read', async () => {
    const dylan = await signIn('dylan');
    const roles = await read(dylan, '/api/v1/roles').expect(200);
    const sales = (
      roles.body.data as { code: string; permissions: string[] }[]
    ).find(({ code }) => code === 'SALES');
    expect(sales?.permissions).toEqual([
      'analytics.read',
      'reports.read',
      'sales.confirm_in_transit',
      'sales.create',
      'sales.read',
      'sales.record_payment',
    ]);

    const permissions = await read(dylan, '/api/v1/permissions').expect(200);
    expect(permissions.headers['cache-control']).toBe('no-store');
    expect(permissions.body.data).toHaveLength(27);
    expect(Object.keys(permissions.body.data[0] as object).sort()).toEqual([
      'code',
      'description',
    ]);
  });
});
