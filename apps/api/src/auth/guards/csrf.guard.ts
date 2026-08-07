import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PUBLIC_ROUTE_METADATA } from '../decorators/public-route.decorator.js';
import type { AuthenticatedRequest } from '../http/auth-http-context.js';
import { AuthHttpException } from '../http/auth-http.exception.js';
import { CsrfTokenService } from '../http/csrf-token.service.js';
import { SessionCookieService } from '../http/session-cookie.service.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(CsrfTokenService)
    private readonly tokens: CsrfTokenService,
    @Inject(SessionCookieService)
    private readonly cookies: SessionCookieService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      safeMethods.has(request.method.toUpperCase()) ||
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_METADATA, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const sessionToken = this.cookies.read(request);
    const csrfToken = request.header('x-csrf-token');
    if (!sessionToken || !this.tokens.verify(sessionToken, csrfToken)) {
      throw AuthHttpException.requestVerificationFailed();
    }
    return true;
  }
}
