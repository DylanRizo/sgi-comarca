import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type {
  ApiSuccess,
  AuthenticationData,
  CsrfData,
  CurrentSessionData,
} from '@sgi/contracts';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

import { ActivationService } from '../application/activation.service.js';
import type { AuthenticationResult } from '../application/authentication-result.js';
import { CurrentSessionService } from '../application/current-session.service.js';
import { LoginService } from '../application/login.service.js';
import { PasswordService } from '../application/password.service.js';
import { SessionService } from '../application/session.service.js';
import { CurrentUser } from '../decorators/current-user.decorator.js';
import { PublicRoute } from '../decorators/public-route.decorator.js';
import {
  ActivationError,
  AuthenticationError,
  PasswordPolicyError,
  SessionError,
} from '../domain/authentication.errors.js';
// DTO values must remain runtime imports so Nest emits validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ActivateAccountDto } from '../dto/activate-account.dto.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ChangePasswordDto } from '../dto/change-password.dto.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LoginDto } from '../dto/login.dto.js';
import type { AuthenticatedRequestContext } from '../http/auth-http-context.js';
import { AuthHttpException } from '../http/auth-http.exception.js';
import { CsrfTokenService } from '../http/csrf-token.service.js';
import { OriginPolicyService } from '../http/origin-policy.service.js';
import { SessionCookieService } from '../http/session-cookie.service.js';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    @Inject(ActivationService)
    private readonly activation: ActivationService,
    @Inject(LoginService)
    private readonly loginService: LoginService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(PasswordService)
    private readonly passwords: PasswordService,
    @Inject(CurrentSessionService)
    private readonly currentSessions: CurrentSessionService,
    @Inject(SessionCookieService)
    private readonly cookies: SessionCookieService,
    @Inject(CsrfTokenService)
    private readonly csrf: CsrfTokenService,
    @Inject(OriginPolicyService)
    private readonly origins: OriginPolicyService,
  ) {}

  @Post('activate')
  @PublicRoute()
  @HttpCode(HttpStatus.CREATED)
  async activateAccount(
    @Body() input: ActivateAccountDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<AuthenticationData>> {
    try {
      const result = await this.activation.activate(
        input.token,
        input.password,
      );
      return this.completeAuthentication(result, request, response);
    } catch (error) {
      if (error instanceof PasswordPolicyError) {
        throw AuthHttpException.passwordPolicyRejected();
      }
      if (error instanceof ActivationError) {
        throw AuthHttpException.activationFailed();
      }
      throw error;
    }
  }

  @Post('login')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<AuthenticationData>> {
    try {
      const canonicalOrigin = this.origins.canonicalRequestOrigin(request);
      const result = await this.loginService.login(
        input.identifier,
        input.password,
        canonicalOrigin,
      );
      return this.completeAuthentication(result, request, response);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw AuthHttpException.authenticationFailed();
      }
      throw error;
    }
  }

  @Get('session')
  async currentSession(
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<CurrentSessionData>> {
    try {
      const session = await this.currentSessions.get(current);
      return this.success(
        {
          absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
          displayName: session.displayName,
          identifier: session.identifier,
          idleExpiresAt: session.idleExpiresAt.toISOString(),
          permissions: session.permissions,
          status: session.status,
          userId: session.userId,
        },
        request,
        response,
      );
    } catch (error) {
      if (error instanceof SessionError)
        throw AuthHttpException.sessionInvalid();
      throw error;
    }
  }

  @Get('csrf')
  csrfToken(
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): ApiSuccess<CsrfData> {
    const sessionToken = this.requireSessionToken(request);
    return this.success(
      {
        csrfToken: this.csrf.create(sessionToken),
        expiresAt: new Date(
          Math.min(
            current.idleExpiresAt.getTime(),
            current.absoluteExpiresAt.getTime(),
          ),
        ).toISOString(),
      },
      request,
      response,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const sessionToken = this.requireSessionToken(request);
    await this.sessions.logout(sessionToken);
    this.cookies.clear(response);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Body() input: ChangePasswordDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    try {
      await this.passwords.changePassword(
        current.userId,
        input.currentPassword,
        input.newPassword,
      );
      this.cookies.clear(response);
    } catch (error) {
      if (error instanceof PasswordPolicyError) {
        throw AuthHttpException.passwordPolicyRejected();
      }
      if (error instanceof AuthenticationError) {
        throw AuthHttpException.authenticationFailed();
      }
      throw error;
    }
  }

  @Post('sessions/revoke-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAllSessions(
    @CurrentUser() current: AuthenticatedRequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.revokeAll(current.userId, 'USER_REVOKED_ALL');
    this.cookies.clear(response);
  }

  private completeAuthentication(
    result: AuthenticationResult,
    request: Request,
    response: Response,
  ): ApiSuccess<AuthenticationData> {
    const sessionToken = result.secret.revealOnce();
    this.cookies.write(response, sessionToken, result.session);
    return this.success(
      {
        csrfToken: this.csrf.create(sessionToken),
        session: {
          absoluteExpiresAt: result.session.absoluteExpiresAt.toISOString(),
          idleExpiresAt: result.session.idleExpiresAt.toISOString(),
        },
        user: result.user,
      },
      request,
      response,
    );
  }

  private requireSessionToken(request: Request): string {
    const token = this.cookies.read(request);
    if (!token) throw AuthHttpException.sessionInvalid();
    return token;
  }

  private success<T>(
    data: T,
    request: Request,
    response: Response,
  ): ApiSuccess<T> {
    const suppliedRequestId = request.header('x-request-id')?.trim();
    const requestId =
      suppliedRequestId && suppliedRequestId.length <= 128
        ? suppliedRequestId
        : randomUUID();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('x-request-id', requestId);
    return { data, meta: { requestId } };
  }
}
