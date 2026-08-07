import { createHash, randomBytes } from 'node:crypto';

import { createDatabaseClient } from '../../../../packages/database/src/client.js';

function requireDatabaseUrl(): string {
  const value = process.env.SGI_E2E_DATABASE_URL;
  if (!value) throw new Error('SGI_E2E_DATABASE_URL is required.');
  return value;
}

export class AuthenticationDatabase {
  private readonly client = createDatabaseClient(requireDatabaseUrl());

  async disconnect(): Promise<void> {
    await this.client.$disconnect();
  }

  async reset(): Promise<void> {
    await this.client.$transaction(async (transaction) => {
      await transaction.session.deleteMany();
      await transaction.loginThrottle.deleteMany();
      await transaction.userInvitation.deleteMany();
      await transaction.passwordCredential.deleteMany();
      await transaction.user.update({
        data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
        where: { loginIdentifier: 'dylan' },
      });
    });
  }

  async createInvitation(): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const createdAt = new Date();
    const user = await this.client.user.findUniqueOrThrow({
      select: { id: true },
      where: { loginIdentifier: 'dylan' },
    });
    await this.client.userInvitation.create({
      data: {
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1_000),
        tokenHash,
        userId: user.id,
      },
    });
    return token;
  }

  async revokeSessions(): Promise<number> {
    const user = await this.client.user.findUniqueOrThrow({
      select: { id: true },
      where: { loginIdentifier: 'dylan' },
    });
    const result = await this.client.session.updateMany({
      data: {
        revokeReason: 'E2E_CONTROLLED_REVOCATION',
        revokedAt: new Date(),
      },
      where: { revokedAt: null, userId: user.id },
    });
    return result.count;
  }

  async originalTokenMatchesPersistedValue(token: string): Promise<boolean> {
    const pattern = `%${token}%`;
    const rows = await this.client.$queryRaw<Array<{ found: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM "user_invitations" WHERE "token_hash"::text = ${token}
        UNION ALL
        SELECT 1 FROM "sessions" WHERE "token_hash"::text = ${token}
        UNION ALL
        SELECT 1
          FROM "audit_logs"
         WHERE COALESCE("before_data"::text, '') LIKE ${pattern}
            OR COALESCE("after_data"::text, '') LIKE ${pattern}
            OR COALESCE("metadata"::text, '') LIKE ${pattern}
      ) AS "found"
    `;
    return rows[0]?.found ?? false;
  }
}
