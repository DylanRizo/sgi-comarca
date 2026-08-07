import { performance } from 'node:perf_hooks';

import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ActivationService } from '../src/auth/application/activation.service.js';
import { AuthAuditService } from '../src/auth/application/auth-audit.service.js';
import { LoginThrottleService } from '../src/auth/application/login-throttle.service.js';
import { LoginService } from '../src/auth/application/login.service.js';
import { PasswordService } from '../src/auth/application/password.service.js';
import { SessionService } from '../src/auth/application/session.service.js';
import {
  ActivationError,
  AuthenticationError,
  SessionError,
} from '../src/auth/domain/authentication.errors.js';
import type {
  Clock,
  PasswordHasher,
  RandomBytesProvider,
  Sleeper,
} from '../src/auth/domain/authentication.ports.js';
import { PasswordPolicy } from '../src/auth/domain/password-policy.js';
import {
  Argon2PasswordHasher,
  minimumArgon2idParameters,
} from '../src/auth/infrastructure/argon2-password-hasher.js';
import { AuthTokenService } from '../src/auth/infrastructure/auth-token.service.js';
import { OriginHasher } from '../src/auth/infrastructure/origin-hasher.js';
import { runBootstrap } from '../../../packages/database/src/bootstrap/run-bootstrap.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Integration database setup did not provide DATABASE_URL.');
}

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const approvedPassword = 'calm river orchard lantern';
const changedPassword = 'gentle mountain harbor phrase';

class MutableClock implements Clock {
  constructor(private value: Date) {}

  advance(milliseconds: number): void {
    this.value = new Date(this.value.getTime() + milliseconds);
  }

  now(): Date {
    return new Date(this.value);
  }
}

class SequentialRandomBytes implements RandomBytesProvider {
  private nextByte = 1;

  bytes(length: number): Buffer {
    const result = Buffer.alloc(length, this.nextByte);
    this.nextByte = (this.nextByte + 1) % 256;
    return result;
  }
}

class RecordingSleeper implements Sleeper {
  readonly delays: number[] = [];

  async sleep(milliseconds: number): Promise<void> {
    this.delays.push(milliseconds);
  }
}

type ServiceContext = ReturnType<typeof createServiceContext>;

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function controlledToken(byte: number): string {
  return Buffer.alloc(32, byte).toString('base64url');
}

function createServiceContext(
  client: DatabaseClient,
  passwordHasher: PasswordHasher = new Argon2PasswordHasher(
    minimumArgon2idParameters,
  ),
) {
  const clock = new MutableClock(new Date('2032-02-03T04:05:06.000Z'));
  const tokenService = new AuthTokenService(new SequentialRandomBytes());
  const audit = new AuthAuditService();
  const sessions = new SessionService(client, tokenService, clock, audit);
  const throttle = new LoginThrottleService(client, clock);
  const sleeper = new RecordingSleeper();
  const originHasher = new OriginHasher(Buffer.alloc(32, 0x6d));
  const activation = new ActivationService(
    client,
    passwordHasher,
    new PasswordPolicy(),
    tokenService,
    sessions,
    clock,
    audit,
  );
  const login = new LoginService(client, {
    audit,
    clock,
    originHasher,
    passwordHasher,
    sessions,
    sleeper,
    throttle,
  });
  const passwords = new PasswordService(
    client,
    passwordHasher,
    new PasswordPolicy(),
    sessions,
    clock,
    audit,
  );
  return {
    activation,
    audit,
    clock,
    login,
    originHasher,
    passwordHasher,
    passwords,
    sessions,
    sleeper,
    throttle,
    tokenService,
  };
}

async function createInvitation(
  client: DatabaseClient,
  context: ServiceContext,
  userId: string,
  byte: number,
  options: {
    consumedAt?: Date;
    createdAt?: Date;
    expiresAt?: Date;
    invalidatedAt?: Date;
  } = {},
): Promise<string> {
  const token = controlledToken(byte);
  const tokenHash = context.tokenService.hashValidatedToken(token);
  if (!tokenHash) throw new Error('Controlled token was invalid.');
  const now = context.clock.now();
  await client.userInvitation.create({
    data: {
      ...(options.consumedAt ? { consumedAt: options.consumedAt } : {}),
      createdAt: options.createdAt ?? now,
      expiresAt: options.expiresAt ?? new Date(now.getTime() + 24 * HOUR_MS),
      ...(options.invalidatedAt
        ? {
            invalidatedAt: options.invalidatedAt,
            invalidationReason: 'CONTROLLED_TEST_INVALIDATION',
          }
        : {}),
      tokenHash,
      userId,
    },
  });
  return token;
}

async function activateDylan(
  client: DatabaseClient,
  context: ServiceContext,
  byte = 0x31,
): Promise<{ sessionToken: string; userId: string }> {
  const user = await client.user.findUniqueOrThrow({
    where: { loginIdentifier: 'dylan' },
  });
  const invitationToken = await createInvitation(
    client,
    context,
    user.id,
    byte,
  );
  const authentication = await context.activation.activate(
    invitationToken,
    approvedPassword,
  );
  return {
    sessionToken: authentication.secret.revealOnce(),
    userId: user.id,
  };
}

describe.sequential('authentication services', () => {
  let client: DatabaseClient;
  let releaseSuiteLock: (() => void) | undefined;
  let suiteLockTask: Promise<unknown> | undefined;

  beforeAll(async () => {
    client = createDatabaseClient(databaseUrl);
    const ready = createDeferred();
    const release = createDeferred();
    releaseSuiteLock = release.resolve;
    suiteLockTask = client.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(3200203)`;
        ready.resolve();
        await release.promise;
      },
      { maxWait: 120_000, timeout: 120_000 },
    );
    await Promise.race([ready.promise, suiteLockTask]);
  });

  beforeEach(async () => {
    await client.session.deleteMany();
    await client.userInvitation.deleteMany();
    await client.passwordCredential.deleteMany();
    await client.loginThrottle.deleteMany();
    await client.user.updateMany({
      data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
    });
    await runBootstrap(client);
  });

  afterAll(async () => {
    await client.session.deleteMany();
    await client.userInvitation.deleteMany();
    await client.passwordCredential.deleteMany();
    await client.loginThrottle.deleteMany();
    await client.user.updateMany({
      data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
    });
    releaseSuiteLock?.();
    await suiteLockTask;
    await client.$disconnect();
  });

  it('activates atomically, persists only hashes and creates the approved session', async () => {
    const context = createServiceContext(client);
    const dylan = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'dylan' },
    });
    const invitationToken = await createInvitation(
      client,
      context,
      dylan.id,
      0x20,
    );
    const sessionToken = (
      await context.activation.activate(invitationToken, approvedPassword)
    ).secret.revealOnce();

    const [user, credential, invitation, session, audit] = await Promise.all([
      client.user.findUniqueOrThrow({ where: { id: dylan.id } }),
      client.passwordCredential.findUniqueOrThrow({
        where: { userId: dylan.id },
      }),
      client.userInvitation.findFirstOrThrow({ where: { userId: dylan.id } }),
      client.session.findFirstOrThrow({ where: { userId: dylan.id } }),
      client.auditLog.findFirstOrThrow({
        where: {
          action: 'AUTH_ACTIVATION_SUCCEEDED',
          entityId: dylan.id,
        },
        orderBy: { occurredAt: 'desc' },
      }),
    ]);

    expect(user).toMatchObject({
      activatedAt: context.clock.now(),
      status: 'ACTIVE',
    });
    expect(credential.passwordHash).toMatch(/^\$argon2id\$/u);
    expect(invitation.consumedAt).toEqual(context.clock.now());
    expect(session.idleExpiresAt.getTime() - session.createdAt.getTime()).toBe(
      30 * MINUTE_MS,
    );
    expect(
      session.absoluteExpiresAt.getTime() - session.createdAt.getTime(),
    ).toBe(8 * HOUR_MS);
    expect(session.tokenHash).toBe(
      context.tokenService.hashValidatedToken(sessionToken),
    );

    const persistence = JSON.stringify({
      audit,
      credential,
      invitation,
      session,
      user,
    });
    expect(persistence).not.toContain(invitationToken);
    expect(persistence).not.toContain(sessionToken);
    expect(persistence).not.toContain(approvedPassword);
  });

  it('returns one generic activation error for expired, consumed and invalidated invitations', async () => {
    const context = createServiceContext(client);
    const dylan = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'dylan' },
    });
    const cases = [
      {
        createdAt: new Date(context.clock.now().getTime() - 24 * HOUR_MS - 1),
        expiresAt: new Date(context.clock.now().getTime() - 1),
      },
      { consumedAt: context.clock.now() },
      { invalidatedAt: context.clock.now() },
    ];
    const messages: string[] = [];

    try {
      await context.activation.activate('malformed-token', approvedPassword);
    } catch (error) {
      expect(error).toBeInstanceOf(ActivationError);
      messages.push((error as Error).message);
    }

    for (const [index, options] of cases.entries()) {
      await client.userInvitation.deleteMany();
      const token = await createInvitation(
        client,
        context,
        dylan.id,
        0x40 + index,
        options,
      );
      try {
        await context.activation.activate(token, approvedPassword);
      } catch (error) {
        expect(error).toBeInstanceOf(ActivationError);
        messages.push((error as Error).message);
      }
    }

    expect(messages).toHaveLength(cases.length + 1);
    expect(new Set(messages)).toEqual(new Set(['Activation failed.']));
    expect(await client.passwordCredential.count()).toBe(0);
    expect(await client.session.count()).toBe(0);
  });

  it('allows exactly one concurrent invitation consumption', async () => {
    const context = createServiceContext(client);
    const dylan = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'dylan' },
    });
    const invitationToken = await createInvitation(
      client,
      context,
      dylan.id,
      0x52,
    );

    const results = await Promise.allSettled([
      context.activation.activate(invitationToken, approvedPassword),
      context.activation.activate(invitationToken, approvedPassword),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    expect(await client.passwordCredential.count()).toBe(1);
    expect(await client.session.count()).toBe(1);
    expect(
      await client.auditLog.count({
        where: {
          action: 'AUTH_ACTIVATION_SUCCEEDED',
          entityId: dylan.id,
        },
      }),
    ).toBeGreaterThanOrEqual(1);
  });

  it('updates throttle atomically, applies approved delays and unlocks after 15 minutes', async () => {
    const context = createServiceContext(client);
    const identifier = 'dylan';
    const originHash = context.originHasher.hash('198.51.100.10');
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        context.throttle.recordFailure(identifier, originHash),
      ),
    );

    expect(
      results.map(({ failedAttemptCount }) => failedAttemptCount).sort(),
    ).toEqual([1, 2, 3, 4]);
    expect(
      results
        .map(({ delayMilliseconds }) => delayMilliseconds)
        .sort((left, right) => left - right),
    ).toEqual([0, 500, 1_000, 2_000]);
    const row = await client.loginThrottle.findUniqueOrThrow({
      where: {
        normalizedIdentifier_originHash: {
          normalizedIdentifier: identifier,
          originHash,
        },
      },
    });
    expect(row.failedAttemptCount).toBe(4);
    expect(row.blockedUntil?.getTime()).toBe(
      context.clock.now().getTime() + 15 * MINUTE_MS,
    );

    context.clock.advance(15 * MINUTE_MS + 1);
    const afterUnlock = await context.throttle.recordFailure(
      identifier,
      originHash,
    );
    expect(afterUnlock).toMatchObject({
      blockedUntil: null,
      delayMilliseconds: 0,
      failedAttemptCount: 1,
    });
  });

  it('commits a failed login before waiting so caller cancellation cannot erase it', async () => {
    const context = createServiceContext(client);
    await activateDylan(client, context, 0x4f);
    const sleepStarted = createDeferred();
    const releaseSleep = createDeferred();
    const blockingSleeper: Sleeper = {
      sleep: async () => {
        sleepStarted.resolve();
        await releaseSleep.promise;
      },
    };
    const login = new LoginService(client, {
      audit: context.audit,
      clock: context.clock,
      originHasher: context.originHasher,
      passwordHasher: context.passwordHasher,
      sessions: context.sessions,
      sleeper: blockingSleeper,
      throttle: context.throttle,
    });

    const attempt = login.login(
      'dylan',
      'controlled incorrect phrase',
      'https://controlled-origin.test',
    );
    await sleepStarted.promise;
    const originHash = context.originHasher.hash(
      'https://controlled-origin.test',
    );
    expect(
      await client.loginThrottle.findUnique({
        where: {
          normalizedIdentifier_originHash: {
            normalizedIdentifier: 'dylan',
            originHash,
          },
        },
      }),
    ).toMatchObject({ failedAttemptCount: 1 });
    expect(
      await client.auditLog.count({
        where: { action: 'AUTH_LOGIN_FAILED' },
      }),
    ).toBeGreaterThan(0);

    releaseSleep.resolve();
    await expect(attempt).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('uses one public authentication error and equivalent Argon2 verification across invalid categories', async () => {
    const context = createServiceContext(client);
    const dylan = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'dylan' },
    });
    const realHash = await context.passwordHasher.hash(approvedPassword);
    const durations: number[] = [];
    const messages: string[] = [];

    const cases: Array<() => Promise<void>> = [
      async () => undefined,
      async () => {
        await client.passwordCredential.create({
          data: { passwordHash: realHash, userId: dylan.id },
        });
      },
      async () => {
        await client.user.update({
          where: { id: dylan.id },
          data: { status: 'DISABLED' },
        });
        await client.passwordCredential.create({
          data: { passwordHash: realHash, userId: dylan.id },
        });
      },
      async () => {
        await client.user.update({
          where: { id: dylan.id },
          data: { activatedAt: context.clock.now(), status: 'ACTIVE' },
        });
      },
      async () => {
        await client.user.update({
          where: { id: dylan.id },
          data: { activatedAt: context.clock.now(), status: 'ACTIVE' },
        });
        await client.passwordCredential.create({
          data: {
            passwordHash: realHash,
            revokeReason: 'CONTROLLED_TEST_REVOCATION',
            revokedAt: context.clock.now(),
            userId: dylan.id,
          },
        });
      },
      async () => {
        await client.user.update({
          where: { id: dylan.id },
          data: { activatedAt: context.clock.now(), status: 'ACTIVE' },
        });
        await client.passwordCredential.create({
          data: { passwordHash: realHash, userId: dylan.id },
        });
      },
    ];

    for (const [index, arrange] of cases.entries()) {
      await client.passwordCredential.deleteMany();
      await client.loginThrottle.deleteMany();
      await client.user.update({
        where: { id: dylan.id },
        data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
      });
      await arrange();
      const startedAt = performance.now();
      try {
        await context.login.login(
          index === 0 ? 'does-not-exist' : 'dylan',
          index === 5 ? 'wrong controlled phrase' : approvedPassword,
          `198.51.100.${20 + index}`,
        );
      } catch (error) {
        durations.push(performance.now() - startedAt);
        expect(error).toBeInstanceOf(AuthenticationError);
        messages.push((error as Error).message);
      }
    }

    expect(new Set(messages)).toEqual(new Set(['Authentication failed.']));
    expect(durations).toHaveLength(cases.length);
    expect(Math.max(...durations) - Math.min(...durations)).toBeLessThan(500);
    expect(await client.session.count()).toBe(0);
  });

  it('logs in, resets the throttle and returns a hash-only session', async () => {
    const context = createServiceContext(client);
    const { userId } = await activateDylan(client, context, 0x61);
    await expect(
      context.login.login(
        ' DYLAN ',
        'incorrect controlled phrase',
        '203.0.113.15',
      ),
    ).rejects.toBeInstanceOf(AuthenticationError);

    const sessionToken = (
      await context.login.login(' DYLAN ', approvedPassword, '203.0.113.15')
    ).secret.revealOnce();
    const originHash = context.originHasher.hash('203.0.113.15');
    const throttle = await client.loginThrottle.findUniqueOrThrow({
      where: {
        normalizedIdentifier_originHash: {
          normalizedIdentifier: 'dylan',
          originHash,
        },
      },
    });
    expect(throttle).toMatchObject({
      blockedUntil: null,
      failedAttemptCount: 0,
      lastFailedAt: null,
    });
    const loginSession = await client.session.findUniqueOrThrow({
      where: {
        tokenHash:
          context.tokenService.hashValidatedToken(sessionToken) ?? 'invalid',
      },
    });
    expect(loginSession.userId).toBe(userId);
    expect(JSON.stringify(loginSession)).not.toContain(sessionToken);
    expect(context.sleeper.delays).toEqual([0]);
  });

  it('renews only active sessions, caps idle expiry and never reactivates revoked or expired sessions', async () => {
    const context = createServiceContext(client);
    const { sessionToken, userId } = await activateDylan(client, context, 0x71);
    const original = await client.session.findFirstOrThrow({
      where: { userId },
    });
    context.clock.advance(10 * MINUTE_MS);
    const renewed = await context.sessions.validateAndRenew(sessionToken);
    expect(renewed.lastSeenAt).toEqual(context.clock.now());
    expect(renewed.idleExpiresAt.getTime()).toBe(
      context.clock.now().getTime() + 30 * MINUTE_MS,
    );
    expect(renewed.absoluteExpiresAt).toEqual(original.absoluteExpiresAt);

    await context.sessions.revokeOne(original.id, 'CONTROLLED_TEST');
    await expect(
      context.sessions.validateAndRenew(sessionToken),
    ).rejects.toBeInstanceOf(SessionError);
    const revoked = await client.session.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(revoked.revokedAt).not.toBeNull();

    const expiringToken = controlledToken(0x72);
    const expiringHash = context.tokenService.hashValidatedToken(expiringToken);
    if (!expiringHash) throw new Error('Controlled session token was invalid.');
    const expiresAt = new Date(context.clock.now().getTime() + 20 * MINUTE_MS);
    const expiring = await client.session.create({
      data: {
        absoluteExpiresAt: expiresAt,
        createdAt: context.clock.now(),
        idleExpiresAt: expiresAt,
        lastSeenAt: context.clock.now(),
        tokenHash: expiringHash,
        userId,
      },
    });
    context.clock.advance(20 * MINUTE_MS);
    await expect(
      context.sessions.validateAndRenew(expiringToken),
    ).rejects.toBeInstanceOf(SessionError);
    expect(
      await client.session.findUniqueOrThrow({ where: { id: expiring.id } }),
    ).toMatchObject({ absoluteExpiresAt: expiresAt, idleExpiresAt: expiresAt });
  });

  it('makes logout idempotent and supports individual and global revocation', async () => {
    const context = createServiceContext(client);
    const { sessionToken, userId } = await activateDylan(client, context, 0x79);
    const previousLogoutAudits = await client.auditLog.count({
      where: { action: 'AUTH_LOGOUT', actorUserId: userId },
    });
    await Promise.all([
      context.sessions.logout(sessionToken),
      context.sessions.logout(sessionToken),
    ]);
    await context.sessions.logout(sessionToken);
    const logoutAudits = await client.auditLog.count({
      where: { action: 'AUTH_LOGOUT', actorUserId: userId },
    });
    expect(logoutAudits - previousLogoutAudits).toBe(1);

    const firstSecret = await context.sessions.create(userId);
    const secondSecret = await context.sessions.create(userId);
    const firstToken = firstSecret.revealOnce();
    const secondToken = secondSecret.revealOnce();
    const activeSessions = await client.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    expect(activeSessions).toHaveLength(2);
    expect(
      await context.sessions.revokeOne(activeSessions[0]?.id ?? '', 'TEST_ONE'),
    ).toBe(1);
    expect(await context.sessions.revokeAll(userId, 'TEST_ALL')).toBe(1);
    expect(
      await client.session.count({ where: { userId, revokedAt: null } }),
    ).toBe(0);
    expect(JSON.stringify([firstSecret, secondSecret])).not.toContain(
      firstToken,
    );
    expect(JSON.stringify([firstSecret, secondSecret])).not.toContain(
      secondToken,
    );
  });

  it('changes the password atomically and revokes every session', async () => {
    const context = createServiceContext(client);
    const { userId } = await activateDylan(client, context, 0x81);
    await context.sessions.create(userId);

    await context.passwords.changePassword(
      userId,
      approvedPassword,
      changedPassword,
    );
    const [credential, sessions, audit] = await Promise.all([
      client.passwordCredential.findUniqueOrThrow({ where: { userId } }),
      client.session.findMany({ where: { userId } }),
      client.auditLog.findFirstOrThrow({
        where: { action: 'AUTH_PASSWORD_CHANGED', entityId: userId },
        orderBy: { occurredAt: 'desc' },
      }),
    ]);
    await expect(
      context.passwordHasher.verify(credential.passwordHash, changedPassword),
    ).resolves.toBe(true);
    await expect(
      context.passwordHasher.verify(credential.passwordHash, approvedPassword),
    ).resolves.toBe(false);
    expect(sessions.every(({ revokedAt }) => revokedAt !== null)).toBe(true);
    const serialized = JSON.stringify({ audit, credential, sessions });
    expect(serialized).not.toContain(approvedPassword);
    expect(serialized).not.toContain(changedPassword);
  });

  it('prevents a login/revocation race from creating a session', async () => {
    const delegate = new Argon2PasswordHasher(minimumArgon2idParameters);
    const verificationStarted = createDeferred();
    const releaseVerification = createDeferred();
    let blockVerification = false;
    const blockingHasher: PasswordHasher = {
      hash: (password) => delegate.hash(password),
      needsRehash: (hash) => delegate.needsRehash(hash),
      verify: async (hash, password) => {
        if (blockVerification) {
          verificationStarted.resolve();
          await releaseVerification.promise;
        }
        return delegate.verify(hash, password);
      },
    };
    const context = createServiceContext(client, blockingHasher);
    const { userId } = await activateDylan(client, context, 0x91);
    await client.session.deleteMany({ where: { userId } });
    blockVerification = true;

    const login = context.login.login('dylan', approvedPassword, '192.0.2.88');
    await verificationStarted.promise;
    await client.passwordCredential.update({
      where: { userId },
      data: {
        revokeReason: 'CONTROLLED_CONCURRENT_REVOCATION',
        revokedAt: context.clock.now(),
      },
    });
    releaseVerification.resolve();

    await expect(login).rejects.toBeInstanceOf(AuthenticationError);
    expect(await client.session.count({ where: { userId } })).toBe(0);
  });

  it('keeps authentication audit records and errors free of controlled secrets', async () => {
    const context = createServiceContext(client);
    const dylan = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'dylan' },
    });
    const invitationToken = await createInvitation(
      client,
      context,
      dylan.id,
      0xa1,
    );
    const sessionToken = (
      await context.activation.activate(invitationToken, approvedPassword)
    ).secret.revealOnce();
    await context.sessions.logout(sessionToken);
    let publicError = '';
    try {
      await context.login.login(
        'dylan',
        'controlled wrong password',
        '192.0.2.99',
      );
    } catch (error) {
      publicError = String(error);
    }

    const [audits, invitations, sessions] = await Promise.all([
      client.auditLog.findMany({
        where: { action: { startsWith: 'AUTH_' } },
      }),
      client.userInvitation.findMany(),
      client.session.findMany(),
    ]);
    const serialized = JSON.stringify({ audits, invitations, sessions });
    for (const secret of [
      approvedPassword,
      'controlled wrong password',
      invitationToken,
      sessionToken,
    ]) {
      expect(serialized).not.toContain(secret);
      expect(publicError).not.toContain(secret);
    }
  });
});
