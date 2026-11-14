import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IntegrationKeyScope } from '@sgi/contracts';

import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import {
  attachIntegrationContext,
  type IntegrationAuthenticatedRequest,
} from './integration-auth-context.js';
import { IntegrationKeyError } from './integration-key.errors.js';
import {
  IntegrationKeyService,
  ownerPermissionForScope,
} from './integration-key.service.js';

const bearerPattern = /^Bearer ([A-Za-z0-9_-]{43})$/u;
const INTEGRATION_SCOPE = Symbol('integration-scope');

export function RequireIntegrationKeyScope(scope: IntegrationKeyScope) {
  return SetMetadata(INTEGRATION_SCOPE, scope);
}

@Injectable()
export class IntegrationKeyGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(IntegrationKeyService)
    private readonly keys: IntegrationKeyService,
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<IntegrationAuthenticatedRequest>();
    const match = bearerPattern.exec(request.header('authorization') ?? '');
    if (!match?.[1]) throw new UnauthorizedException();

    try {
      const key = await this.keys.authenticate(match[1]);
      const scope =
        this.reflector.getAllAndOverride<IntegrationKeyScope>(
          INTEGRATION_SCOPE,
          [context.getHandler(), context.getClass()],
        ) ?? 'inventory.read';
      if (
        !key.scopes.includes(scope) ||
        !(await this.permissions.hasPermission(
          key.ownerUserId,
          ownerPermissionForScope(scope),
        ))
      ) {
        throw new ForbiddenException();
      }
      await this.keys.consumeQueryAllowance(key.keyId);
      attachIntegrationContext(request, key);
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      if (error instanceof IntegrationKeyError) {
        if (error.code === 'RATE_LIMITED') {
          throw new HttpException(
            'Rate limit exceeded.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        if (error.code === 'INTEGRATION_DISABLED') {
          throw new HttpException(
            'Integration keys are disabled.',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        throw new UnauthorizedException();
      }
      throw error;
    }
  }
}
