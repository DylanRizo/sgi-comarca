import type { DatabaseClient } from '@sgi/database';

import { AuthenticationError } from '../domain/authentication.errors.js';
import type { Clock, PasswordHasher } from '../domain/authentication.ports.js';
import { SystemClock } from '../domain/authentication.ports.js';
import { PasswordPolicy } from '../domain/password-policy.js';
import { AuthAuditService } from './auth-audit.service.js';
import { SessionService } from './session.service.js';

export class PasswordService {
  constructor(
    private readonly client: DatabaseClient,
    private readonly passwordHasher: PasswordHasher,
    private readonly passwordPolicy = new PasswordPolicy(),
    private readonly sessions = new SessionService(client),
    private readonly clock: Clock = new SystemClock(),
    private readonly audit = new AuthAuditService(),
  ) {}

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.client.user.findUnique({
      where: { id: userId },
      select: {
        loginIdentifier: true,
        passwordCredential: {
          select: { id: true, passwordHash: true, revokedAt: true },
        },
        status: true,
      },
    });
    if (!user?.passwordCredential || user.passwordCredential.revokedAt) {
      throw new AuthenticationError();
    }
    const currentHash = user.passwordCredential.passwordHash;
    if (
      !(await this.passwordHasher.verify(
        currentHash,
        currentPassword.normalize('NFC'),
      ))
    ) {
      throw new AuthenticationError();
    }

    const normalizedPassword = this.passwordPolicy.validate(
      newPassword,
      user.loginIdentifier,
    );
    const newPasswordHash = await this.passwordHasher.hash(normalizedPassword);
    const now = this.clock.now();
    const changed = await this.client.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`
          SELECT id
          FROM users
          WHERE id = ${userId}::uuid
          FOR UPDATE
        `;
        const current = await transaction.user.findUnique({
          where: { id: userId },
          select: {
            passwordCredential: {
              select: { id: true, passwordHash: true, revokedAt: true },
            },
            status: true,
          },
        });
        if (
          current?.status !== 'ACTIVE' ||
          !current.passwordCredential ||
          current.passwordCredential.revokedAt ||
          current.passwordCredential.passwordHash !== currentHash
        ) {
          return false;
        }

        await transaction.passwordCredential.update({
          where: { id: current.passwordCredential.id },
          data: {
            passwordChangedAt: now,
            passwordHash: newPasswordHash,
          },
        });
        const revokedSessionCount = await this.sessions.revokeAllInTransaction(
          transaction,
          userId,
          'PASSWORD_CHANGED',
          now,
        );
        await this.audit.record(transaction, {
          action: 'AUTH_PASSWORD_CHANGED',
          actorUserId: userId,
          entityId: userId,
          metadata: { revokedSessionCount },
          occurredAt: now,
        });
        return true;
      },
      { isolationLevel: 'Serializable' },
    );
    if (!changed) throw new AuthenticationError();
  }
}
