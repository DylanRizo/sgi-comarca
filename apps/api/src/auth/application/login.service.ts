import { createHash } from 'node:crypto';

import type { DatabaseClient } from '@sgi/database';

import { AuthenticationError } from '../domain/authentication.errors.js';
import type {
  Clock,
  PasswordHasher,
  Sleeper,
} from '../domain/authentication.ports.js';
import { SystemClock, SystemSleeper } from '../domain/authentication.ports.js';
import { IdentifierNormalizer } from '../domain/identifier-normalizer.js';
import type { SecretToken } from '../infrastructure/auth-token.service.js';
import type { OriginHasher } from '../infrastructure/origin-hasher.js';
import { AuthAuditService } from './auth-audit.service.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { SessionService } from './session.service.js';

type LoginCandidate = {
  id: string;
  passwordCredential: { passwordHash: string; revokedAt: Date | null } | null;
  status: 'ACTIVE' | 'DISABLED' | 'PENDING_ACTIVATION';
};

export type LoginServiceDependencies = {
  audit?: AuthAuditService;
  clock?: Clock;
  identifiers?: IdentifierNormalizer;
  originHasher: OriginHasher;
  passwordHasher: PasswordHasher;
  sessions?: SessionService;
  sleeper?: Sleeper;
  throttle?: LoginThrottleService;
};

export class LoginService {
  private readonly audit: AuthAuditService;
  private readonly clock: Clock;
  private readonly dummyPasswordHash: Promise<string>;
  private readonly identifiers: IdentifierNormalizer;
  private readonly sessions: SessionService;
  private readonly sleeper: Sleeper;
  private readonly throttle: LoginThrottleService;

  constructor(
    private readonly client: DatabaseClient,
    private readonly dependencies: LoginServiceDependencies,
  ) {
    this.audit = dependencies.audit ?? new AuthAuditService();
    this.clock = dependencies.clock ?? new SystemClock();
    this.identifiers = dependencies.identifiers ?? new IdentifierNormalizer();
    this.sessions = dependencies.sessions ?? new SessionService(client);
    this.sleeper = dependencies.sleeper ?? new SystemSleeper();
    this.throttle =
      dependencies.throttle ?? new LoginThrottleService(client, this.clock);
    this.dummyPasswordHash = dependencies.passwordHasher.hash(
      createHash('sha256')
        .update('sgi-authentication-dummy-verification', 'utf8')
        .digest('hex'),
    );
  }

  async login(
    identifier: string,
    password: string,
    canonicalOrigin: string,
  ): Promise<SecretToken> {
    const normalizedIdentifier = this.normalizedThrottleKey(identifier);
    const originHash = this.dependencies.originHasher.hash(canonicalOrigin);
    const blockedUntil = await this.throttle.blockedUntil(
      normalizedIdentifier,
      originHash,
    );
    if (blockedUntil) {
      await this.recordBlockedAttempt();
      throw new AuthenticationError();
    }

    const candidate = await this.client.user.findUnique({
      where: { loginIdentifier: normalizedIdentifier },
      select: {
        id: true,
        passwordCredential: {
          select: { passwordHash: true, revokedAt: true },
        },
        status: true,
      },
    });
    const dummyPasswordHash = await this.dummyPasswordHash;
    const usableCandidate = this.usableCandidate(candidate);
    const hashToVerify = usableCandidate
      ? usableCandidate.passwordCredential.passwordHash
      : dummyPasswordHash;
    const verified = await this.dependencies.passwordHasher.verify(
      hashToVerify,
      password.normalize('NFC'),
    );
    if (!usableCandidate || !verified) {
      return this.failLogin(normalizedIdentifier, originHash);
    }

    const generatedSession = this.sessions.prepare();
    const now = this.clock.now();
    const authenticated = await this.client.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`
            SELECT id
            FROM users
            WHERE id = ${usableCandidate.id}::uuid
            FOR UPDATE
          `;
        const current = await transaction.user.findUnique({
          where: { id: usableCandidate.id },
          select: {
            passwordCredential: {
              select: { passwordHash: true, revokedAt: true },
            },
            status: true,
          },
        });
        if (
          current?.status !== 'ACTIVE' ||
          !current.passwordCredential ||
          current.passwordCredential.revokedAt ||
          current.passwordCredential.passwordHash !==
            usableCandidate.passwordCredential.passwordHash
        ) {
          return false;
        }

        await this.throttle.resetInTransaction(
          transaction,
          normalizedIdentifier,
          originHash,
          now,
        );
        await this.sessions.createInTransaction(
          transaction,
          usableCandidate.id,
          generatedSession,
          now,
        );
        await this.audit.record(transaction, {
          action: 'AUTH_LOGIN_SUCCEEDED',
          actorUserId: usableCandidate.id,
          entityId: usableCandidate.id,
          occurredAt: now,
        });
        return true;
      },
      { isolationLevel: 'Serializable' },
    );
    if (!authenticated) {
      await this.failLogin(normalizedIdentifier, originHash);
    }
    return generatedSession.secret;
  }

  private usableCandidate(candidate: LoginCandidate | null):
    | (LoginCandidate & {
        passwordCredential: NonNullable<LoginCandidate['passwordCredential']>;
      })
    | null {
    if (
      !candidate ||
      candidate.status !== 'ACTIVE' ||
      !candidate.passwordCredential ||
      candidate.passwordCredential.revokedAt
    ) {
      return null;
    }
    return { ...candidate, passwordCredential: candidate.passwordCredential };
  }

  private normalizedThrottleKey(identifier: string): string {
    const normalized = this.identifiers.normalize(identifier);
    return [...normalized].slice(0, 64).join('');
  }

  private async failLogin(
    normalizedIdentifier: string,
    originHash: string,
  ): Promise<never> {
    const now = this.clock.now();
    const state = await this.client.$transaction(async (transaction) => {
      const result = await this.throttle.recordFailureInTransaction(
        transaction,
        normalizedIdentifier,
        originHash,
        now,
      );
      await this.audit.record(transaction, {
        action: 'AUTH_LOGIN_FAILED',
        metadata: {
          attempt: result.failedAttemptCount,
          blocked: result.blockedUntil !== null,
        },
        occurredAt: now,
      });
      return result;
    });
    await this.sleeper.sleep(state.delayMilliseconds);
    throw new AuthenticationError();
  }

  private async recordBlockedAttempt(): Promise<void> {
    const now = this.clock.now();
    await this.client.$transaction((transaction) =>
      this.audit.record(transaction, {
        action: 'AUTH_LOGIN_BLOCKED',
        occurredAt: now,
      }),
    );
  }
}
