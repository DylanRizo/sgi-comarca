import type { DatabaseClient } from '@sgi/database';

import { ActivationError } from '../domain/authentication.errors.js';
import type { Clock, PasswordHasher } from '../domain/authentication.ports.js';
import { SystemClock } from '../domain/authentication.ports.js';
import { PasswordPolicy } from '../domain/password-policy.js';
import {
  AuthTokenService,
  type SecretToken,
} from '../infrastructure/auth-token.service.js';
import { AuthAuditService } from './auth-audit.service.js';
import { SessionService } from './session.service.js';

type ConsumedInvitation = { userId: string };

function isExpectedActivationConflict(error: unknown): boolean {
  if (error instanceof ActivationError) return true;
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return error.code === 'P2002' || error.code === 'P2034';
}

export class ActivationService {
  constructor(
    private readonly client: DatabaseClient,
    private readonly passwordHasher: PasswordHasher,
    private readonly passwordPolicy = new PasswordPolicy(),
    private readonly tokens = new AuthTokenService(),
    private readonly sessions = new SessionService(client, tokens),
    private readonly clock: Clock = new SystemClock(),
    private readonly audit = new AuthAuditService(),
  ) {}

  async activate(
    invitationToken: string,
    password: string,
  ): Promise<SecretToken> {
    const invitationHash = this.tokens.hashValidatedToken(invitationToken);
    if (!invitationHash) throw new ActivationError();

    const invitation = await this.client.userInvitation.findUnique({
      where: { tokenHash: invitationHash },
      select: {
        consumedAt: true,
        expiresAt: true,
        invalidatedAt: true,
        user: { select: { loginIdentifier: true, status: true } },
      },
    });
    const initialNow = this.clock.now();
    if (
      !invitation ||
      invitation.consumedAt ||
      invitation.invalidatedAt ||
      invitation.expiresAt <= initialNow ||
      invitation.user.status !== 'PENDING_ACTIVATION'
    ) {
      throw new ActivationError();
    }

    let normalizedPassword: string;
    try {
      normalizedPassword = this.passwordPolicy.validate(
        password,
        invitation.user.loginIdentifier,
      );
    } catch (error) {
      if (isExpectedActivationConflict(error)) throw new ActivationError();
      throw error;
    }
    const passwordHash = await this.passwordHasher.hash(normalizedPassword);
    const generatedSession = this.sessions.prepare();
    const now = this.clock.now();

    try {
      await this.client.$transaction(
        async (transaction) => {
          const consumed = await transaction.$queryRaw<ConsumedInvitation[]>`
            UPDATE user_invitations
            SET consumed_at = ${now}
            WHERE
              token_hash = ${invitationHash}
              AND consumed_at IS NULL
              AND invalidated_at IS NULL
              AND expires_at > ${now}
            RETURNING user_id AS "userId"
          `;
          const consumedInvitation = consumed[0];
          if (!consumedInvitation) throw new ActivationError();

          await transaction.$queryRaw`
            SELECT id
            FROM users
            WHERE id = ${consumedInvitation.userId}::uuid
            FOR UPDATE
          `;
          const user = await transaction.user.findUnique({
            where: { id: consumedInvitation.userId },
            select: { id: true, status: true },
          });
          if (!user || user.status !== 'PENDING_ACTIVATION') {
            throw new ActivationError();
          }

          const credential = await transaction.passwordCredential.findUnique({
            where: { userId: user.id },
            select: { id: true, revokedAt: true },
          });
          if (credential && !credential.revokedAt) throw new ActivationError();
          if (credential) {
            await transaction.passwordCredential.update({
              where: { id: credential.id },
              data: {
                passwordChangedAt: now,
                passwordHash,
                revokedAt: null,
                revokedByUserId: null,
                revokeReason: null,
              },
            });
          } else {
            await transaction.passwordCredential.create({
              data: {
                passwordChangedAt: now,
                passwordHash,
                userId: user.id,
              },
            });
          }

          await transaction.user.update({
            where: { id: user.id },
            data: { activatedAt: now, status: 'ACTIVE' },
          });
          await this.sessions.createInTransaction(
            transaction,
            user.id,
            generatedSession,
            now,
          );
          await this.audit.record(transaction, {
            action: 'AUTH_ACTIVATION_SUCCEEDED',
            actorUserId: user.id,
            entityId: user.id,
            occurredAt: now,
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (isExpectedActivationConflict(error)) throw new ActivationError();
      throw error;
    }

    return generatedSession.secret;
  }
}
