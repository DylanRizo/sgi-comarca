import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';

import { SessionService } from '../application/session.service.js';
import { PUBLIC_ROUTE_METADATA } from '../decorators/public-route.decorator.js';
import { SessionError } from '../domain/authentication.errors.js';
import {
  attachAuthenticatedContext,
  type AuthenticatedRequest,
} from '../http/auth-http-context.js';
import { SessionCookieService } from '../http/session-cookie.service.js';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(SessionCookieService)
    private readonly cookies: SessionCookieService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_METADATA, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const token = this.cookies.read(request);
    if (!token) throw new UnauthorizedException('Authentication required.');

    try {
      const session = await this.sessions.validateAndRenew(token);
      attachAuthenticatedContext(request, session);
      this.cookies.write(response, token, session);
      return true;
    } catch (error) {
      if (!(error instanceof SessionError)) throw error;
      this.cookies.clear(response);
      throw new UnauthorizedException('Authentication required.');
    }
  }
}
