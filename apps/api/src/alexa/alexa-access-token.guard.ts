import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { alexaScopes } from '@sgi/contracts';

import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import {
  attachAlexaAuthenticatedContext,
  type AlexaAuthenticatedRequest,
} from './alexa-auth-context.js';
import { AlexaOAuthError } from './alexa-oauth.errors.js';
import { AlexaOAuthService } from './alexa-oauth.service.js';

const bearerPattern = /^Bearer ([A-Za-z0-9_-]{43})$/u;

@Injectable()
export class AlexaAccessTokenGuard implements CanActivate {
  constructor(
    @Inject(AlexaOAuthService)
    private readonly oauth: AlexaOAuthService,
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AlexaAuthenticatedRequest>();
    const match = bearerPattern.exec(request.header('authorization') ?? '');
    if (!match?.[1]) throw new UnauthorizedException();

    try {
      const access = await this.oauth.validateAccessToken(match[1]);
      if (alexaScopes.some((scope) => !access.scopes.includes(scope))) {
        throw new ForbiddenException();
      }
      for (const scope of alexaScopes) {
        if (!(await this.permissions.hasPermission(access.userId, scope))) {
          throw new ForbiddenException();
        }
      }
      await this.oauth.consumeQueryAllowance(access.linkId);
      attachAlexaAuthenticatedContext(request, access);
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      if (error instanceof AlexaOAuthError) {
        if (error.code === 'RATE_LIMITED') {
          throw new HttpException(
            'Rate limit exceeded.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        throw new UnauthorizedException();
      }
      throw error;
    }
  }
}
