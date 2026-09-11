import type { ConfigType } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { DatabaseClient } from '@sgi/database';
import { createHash, timingSafeEqual } from 'node:crypto';

import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import type { TransactionClient } from '../auth/application/last-admin-policy.js';
import type { Clock } from '../auth/domain/authentication.ports.js';
import { SystemClock } from '../auth/domain/authentication.ports.js';
import { AuthTokenService } from '../auth/infrastructure/auth-token.service.js';
import type { appConfig } from '../config/app.config.js';
import type {
  AlexaAuthorizationDto,
  AlexaTokenDto,
} from './dto/alexa-oauth.dto.js';
import { AlexaOAuthError } from './alexa-oauth.errors.js';

const AUTHORIZATION_CODE_LIFETIME_MS = 5 * 60 * 1000;

export type AlexaTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: 'Bearer';
};

export type ValidAlexaAccess = {
  linkId: string;
  scopes: readonly string[];
  tokenId: string;
  userId: string;
};

type LinkWithUser = {
  authorizedAt: Date;
  clientId: string;
  id: string;
  revokedAt: Date | null;
  scopes: string[];
  user: {
    passwordCredential: {
      passwordChangedAt: Date;
      revokedAt: Date | null;
    } | null;
    status: 'ACTIVE' | 'DISABLED' | 'PENDING_ACTIVATION';
  };
  userId: string;
};

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function equalHash(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(left) || !/^[a-f0-9]{64}$/u.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

function equalValue(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export class AlexaOAuthService {
  private readonly logger = new Logger(AlexaOAuthService.name);
  private readonly permissions: EffectivePermissionsService;
  private readonly tokens = new AuthTokenService();

  constructor(
    private readonly client: DatabaseClient,
    private readonly configuration: ConfigType<typeof appConfig>,
    permissions?: EffectivePermissionsService,
    private readonly clock: Clock = new SystemClock(),
  ) {
    this.permissions = permissions ?? new EffectivePermissionsService(client);
  }

  async authorize(
    userId: string,
    input: AlexaAuthorizationDto,
  ): Promise<{ redirectUrl: string }> {
    this.requireEnabled();
    this.requireAuthorizationRequest(input);
    const redirect = new URL(input.redirectUri);
    redirect.searchParams.set('state', input.state);
    if (!input.approved) {
      redirect.searchParams.set('error', 'access_denied');
      return { redirectUrl: redirect.toString() };
    }

    const scopes = this.parseScopes(input.scope);
    for (const scope of scopes) {
      if (!(await this.permissions.hasPermission(userId, scope))) {
        throw new AlexaOAuthError('ACCESS_DENIED');
      }
    }

    const generated = this.tokens.generate();
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + AUTHORIZATION_CODE_LIFETIME_MS);
    await this.client.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`
          SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE
        `;
        const user = await transaction.user.findUnique({
          where: { id: userId },
          select: {
            passwordCredential: { select: { revokedAt: true } },
            status: true,
          },
        });
        if (
          user?.status !== 'ACTIVE' ||
          !user.passwordCredential ||
          user.passwordCredential.revokedAt
        ) {
          throw new AlexaOAuthError('ACCESS_DENIED');
        }

        const link = await transaction.alexaAccountLink.upsert({
          where: { userId_clientId: { clientId: input.clientId, userId } },
          create: {
            authorizedAt: now,
            clientId: input.clientId,
            scopes,
            userId,
          },
          update: { authorizedAt: now, revokedAt: null, scopes },
        });
        await transaction.alexaAuthorizationCode.updateMany({
          where: { consumedAt: null, linkId: link.id },
          data: { consumedAt: now },
        });
        await transaction.alexaOAuthToken.updateMany({
          where: { revokedAt: null, linkId: link.id },
          data: {
            revokedAt: now,
            revocationReason: 'ACCOUNT_REAUTHORIZED',
          },
        });
        await transaction.alexaAuthorizationCode.create({
          data: {
            codeChallenge: input.codeChallenge,
            codeChallengeMethod: input.codeChallengeMethod,
            expiresAt,
            linkId: link.id,
            tokenHash: generated.tokenHash,
            redirectUri: input.redirectUri,
          },
        });
        await this.recordAudit(transaction, {
          action: 'ALEXA_ACCOUNT_LINK_AUTHORIZED',
          actorUserId: userId,
          entityId: link.id,
          metadata: { scopes: scopes.join(' ') },
          occurredAt: now,
        });
      },
      { isolationLevel: 'Serializable' },
    );

    redirect.searchParams.set('code', generated.secret.revealOnce());
    return { redirectUrl: redirect.toString() };
  }

  async exchange(input: AlexaTokenDto): Promise<AlexaTokenResponse> {
    this.requireEnabled();
    this.requireClient(input.client_id, input.client_secret);
    if (input.grant_type === 'authorization_code') {
      return this.exchangeAuthorizationCode(input);
    }
    return this.exchangeRefreshToken(input);
  }

  async validateAccessToken(rawToken: string): Promise<ValidAlexaAccess> {
    this.requireEnabled();
    const tokenHash = this.tokens.hashValidatedToken(rawToken);
    if (!tokenHash) throw new AlexaOAuthError('INVALID_GRANT');
    const now = this.clock.now();
    const token = await this.client.alexaOAuthToken.findUnique({
      where: { tokenHash },
      include: {
        link: {
          include: {
            user: {
              select: {
                passwordCredential: {
                  select: { passwordChangedAt: true, revokedAt: true },
                },
                status: true,
              },
            },
          },
        },
      },
    });
    if (
      !token ||
      token.kind !== 'ACCESS' ||
      token.revokedAt ||
      token.expiresAt <= now ||
      !this.linkIsUsable(token.link)
    ) {
      throw new AlexaOAuthError('INVALID_GRANT');
    }
    return {
      linkId: token.link.id,
      scopes: token.link.scopes,
      tokenId: token.id,
      userId: token.link.userId,
    };
  }

  async consumeQueryAllowance(linkId: string): Promise<void> {
    const now = this.clock.now();
    const resetBefore = new Date(now.getTime() - 60 * 1000);
    const rows = await this.client.$queryRaw<Array<{ requestCount: number }>>`
      INSERT INTO alexa_rate_limit_windows (
        link_id, window_started_at, request_count, updated_at
      ) VALUES (${linkId}::uuid, ${now}, 1, ${now})
      ON CONFLICT (link_id) DO UPDATE SET
        window_started_at = CASE
          WHEN alexa_rate_limit_windows.window_started_at <= ${resetBefore}
            THEN ${now}
          ELSE alexa_rate_limit_windows.window_started_at
        END,
        request_count = CASE
          WHEN alexa_rate_limit_windows.window_started_at <= ${resetBefore}
            THEN 1
          ELSE alexa_rate_limit_windows.request_count + 1
        END,
        updated_at = ${now}
      RETURNING request_count AS "requestCount"
    `;
    if (
      (rows[0]?.requestCount ??
        this.configuration.alexa.queryLimitPerMinute + 1) >
      this.configuration.alexa.queryLimitPerMinute
    ) {
      throw new AlexaOAuthError('RATE_LIMITED');
    }
  }

  async status(userId: string): Promise<{
    authorizedAt: string | null;
    linked: boolean;
    scopes: readonly string[];
  }> {
    const link = await this.client.alexaAccountLink.findUnique({
      where: {
        userId_clientId: {
          clientId: this.configuration.alexa.clientId,
          userId,
        },
      },
      select: { authorizedAt: true, revokedAt: true, scopes: true },
    });
    return {
      authorizedAt:
        link && !link.revokedAt ? link.authorizedAt.toISOString() : null,
      linked: Boolean(link && !link.revokedAt),
      scopes: link && !link.revokedAt ? link.scopes : [],
    };
  }

  async revoke(userId: string): Promise<void> {
    const now = this.clock.now();
    await this.client.$transaction(async (transaction) => {
      const link = await transaction.alexaAccountLink.findUnique({
        where: {
          userId_clientId: {
            clientId: this.configuration.alexa.clientId,
            userId,
          },
        },
      });
      if (!link || link.revokedAt) return;
      await transaction.alexaAccountLink.update({
        where: { id: link.id },
        data: { revokedAt: now },
      });
      await transaction.alexaOAuthToken.updateMany({
        where: { linkId: link.id, revokedAt: null },
        data: { revokedAt: now, revocationReason: 'USER_REVOKED' },
      });
      await this.recordAudit(transaction, {
        action: 'ALEXA_ACCOUNT_LINK_REVOKED',
        actorUserId: userId,
        entityId: link.id,
        occurredAt: now,
      });
    });
  }

  async recordQuery(
    access: ValidAlexaAccess,
    requestType: string,
    intentName?: string,
  ): Promise<void> {
    await this.client.auditLog.create({
      data: {
        action: 'ALEXA_READ_REQUESTED',
        actorUserId: access.userId,
        entityId: access.linkId,
        entityType: 'ALEXA_ACCOUNT_LINK',
        metadata: {
          ...(intentName ? { intentName } : {}),
          requestType,
        },
        occurredAt: this.clock.now(),
      },
    });
  }

  private async exchangeAuthorizationCode(
    input: AlexaTokenDto,
  ): Promise<AlexaTokenResponse> {
    if (!input.code || !input.redirect_uri || !input.code_verifier) {
      throw new AlexaOAuthError('INVALID_REQUEST');
    }
    const codeVerifier = input.code_verifier;
    const tokenHash = this.tokens.hashValidatedToken(input.code);
    if (!tokenHash) throw new AlexaOAuthError('INVALID_GRANT');
    const now = this.clock.now();
    const generated = this.generateTokenPair();
    let scopes: readonly string[] = [];

    await this.client.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`
          SELECT id FROM alexa_authorization_codes
          WHERE token_hash = ${tokenHash}
          FOR UPDATE
        `;
        const code = await transaction.alexaAuthorizationCode.findUnique({
          where: { tokenHash },
          include: {
            link: {
              include: {
                user: {
                  select: {
                    passwordCredential: {
                      select: { passwordChangedAt: true, revokedAt: true },
                    },
                    status: true,
                  },
                },
              },
            },
          },
        });
        if (
          !code ||
          code.consumedAt ||
          code.expiresAt <= now ||
          code.redirectUri !== input.redirect_uri ||
          code.codeChallengeMethod !== 'S256' ||
          !equalValue(pkceChallenge(codeVerifier), code.codeChallenge) ||
          !this.linkIsUsable(code.link)
        ) {
          throw new AlexaOAuthError('INVALID_GRANT');
        }
        await transaction.alexaAuthorizationCode.update({
          where: { id: code.id },
          data: { consumedAt: now },
        });
        await this.persistTokenPair(transaction, code.link, generated, now);
        scopes = code.link.scopes;
        await this.recordAudit(transaction, {
          action: 'ALEXA_TOKENS_ISSUED',
          actorUserId: code.link.userId,
          entityId: code.link.id,
          metadata: { grantType: 'authorization_code' },
          occurredAt: now,
        });
      },
      { isolationLevel: 'Serializable' },
    );
    return this.revealTokenPair(generated, scopes);
  }

  private async exchangeRefreshToken(
    input: AlexaTokenDto,
  ): Promise<AlexaTokenResponse> {
    if (!input.refresh_token) throw new AlexaOAuthError('INVALID_REQUEST');
    const tokenHash = this.tokens.hashValidatedToken(input.refresh_token);
    if (!tokenHash) throw new AlexaOAuthError('INVALID_GRANT');
    const now = this.clock.now();
    const generated = this.generateTokenPair();
    let scopes: readonly string[] = [];

    await this.client.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`
          SELECT id FROM alexa_oauth_tokens
          WHERE token_hash = ${tokenHash}
          FOR UPDATE
        `;
        const token = await transaction.alexaOAuthToken.findUnique({
          where: { tokenHash },
          include: {
            link: {
              include: {
                user: {
                  select: {
                    passwordCredential: {
                      select: { passwordChangedAt: true, revokedAt: true },
                    },
                    status: true,
                  },
                },
              },
            },
          },
        });
        if (
          !token ||
          token.kind !== 'REFRESH' ||
          token.revokedAt ||
          token.expiresAt <= now ||
          !this.linkIsUsable(token.link)
        ) {
          throw new AlexaOAuthError('INVALID_GRANT');
        }
        await transaction.alexaOAuthToken.update({
          where: { id: token.id },
          data: { revokedAt: now, revocationReason: 'ROTATED' },
        });
        await this.persistTokenPair(transaction, token.link, generated, now);
        scopes = token.link.scopes;
        await this.recordAudit(transaction, {
          action: 'ALEXA_TOKENS_ISSUED',
          actorUserId: token.link.userId,
          entityId: token.link.id,
          metadata: { grantType: 'refresh_token' },
          occurredAt: now,
        });
      },
      { isolationLevel: 'Serializable' },
    );
    return this.revealTokenPair(generated, scopes);
  }

  private generateTokenPair() {
    return { access: this.tokens.generate(), refresh: this.tokens.generate() };
  }

  private async persistTokenPair(
    transaction: TransactionClient,
    link: LinkWithUser,
    generated: ReturnType<AlexaOAuthService['generateTokenPair']>,
    now: Date,
  ): Promise<void> {
    await transaction.alexaOAuthToken.createMany({
      data: [
        {
          expiresAt: new Date(
            now.getTime() +
              this.configuration.alexa.accessTokenLifetimeSeconds * 1000,
          ),
          kind: 'ACCESS',
          linkId: link.id,
          tokenHash: generated.access.tokenHash,
        },
        {
          expiresAt: new Date(
            now.getTime() +
              this.configuration.alexa.refreshTokenLifetimeSeconds * 1000,
          ),
          kind: 'REFRESH',
          linkId: link.id,
          tokenHash: generated.refresh.tokenHash,
        },
      ],
    });
  }

  private revealTokenPair(
    generated: ReturnType<AlexaOAuthService['generateTokenPair']>,
    scopes: readonly string[],
  ): AlexaTokenResponse {
    return {
      access_token: generated.access.secret.revealOnce(),
      expires_in: this.configuration.alexa.accessTokenLifetimeSeconds,
      refresh_token: generated.refresh.secret.revealOnce(),
      scope: scopes.join(' '),
      token_type: 'Bearer',
    };
  }

  private linkIsUsable(link: LinkWithUser): boolean {
    const credential = link.user.passwordCredential;
    return Boolean(
      link.clientId === this.configuration.alexa.clientId &&
      !link.revokedAt &&
      link.user.status === 'ACTIVE' &&
      credential &&
      !credential.revokedAt &&
      credential.passwordChangedAt <= link.authorizedAt,
    );
  }

  private parseScopes(raw: string | undefined): string[] {
    const requested = raw?.trim()
      ? [...new Set(raw.trim().split(/\s+/u))]
      : [...this.configuration.alexa.scopes];
    if (
      requested.length !== this.configuration.alexa.scopes.length ||
      requested.some(
        (scope) =>
          !(this.configuration.alexa.scopes as readonly string[]).includes(
            scope,
          ),
      )
    ) {
      throw new AlexaOAuthError('INVALID_REQUEST');
    }
    return requested.sort();
  }

  private requireAuthorizationRequest(input: AlexaAuthorizationDto): void {
    const clientIdMatches =
      input.clientId === this.configuration.alexa.clientId;
    const redirectUriMatches = this.configuration.alexa.redirectUris.includes(
      input.redirectUri,
    );
    const responseTypeMatches = input.responseType === 'code';
    const codeChallengeMethodMatches = input.codeChallengeMethod === 'S256';

    if (
      !clientIdMatches ||
      !redirectUriMatches ||
      !responseTypeMatches ||
      !codeChallengeMethodMatches
    ) {
      this.logger.warn(
        `Alexa authorization request rejected: clientIdMatches=${clientIdMatches}, redirectUriMatches=${redirectUriMatches}, responseTypeMatches=${responseTypeMatches}, codeChallengeMethodMatches=${codeChallengeMethodMatches}.`,
      );
      throw new AlexaOAuthError('INVALID_REQUEST');
    }
  }

  private requireClient(clientId: string, secret: string): void {
    if (
      clientId !== this.configuration.alexa.clientId ||
      !equalHash(hash(secret), this.configuration.alexa.clientSecretHash)
    ) {
      throw new AlexaOAuthError('INVALID_CLIENT');
    }
  }

  private requireEnabled(): void {
    if (!this.configuration.alexa.enabled) {
      throw new AlexaOAuthError('INTEGRATION_DISABLED');
    }
  }

  private async recordAudit(
    transaction: TransactionClient,
    input: {
      action: string;
      actorUserId: string;
      entityId: string;
      metadata?: Record<string, string>;
      occurredAt: Date;
    },
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action: input.action,
        actorUserId: input.actorUserId,
        entityId: input.entityId,
        entityType: 'ALEXA_ACCOUNT_LINK',
        metadata: input.metadata ?? {},
        occurredAt: input.occurredAt,
      },
    });
  }
}
