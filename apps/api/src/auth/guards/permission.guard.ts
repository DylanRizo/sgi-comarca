import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { EffectivePermissionsService } from '../application/effective-permissions.service.js';
import { PUBLIC_ROUTE_METADATA } from '../decorators/public-route.decorator.js';
import { REQUIRED_PERMISSION_METADATA } from '../decorators/require-permission.decorator.js';
import {
  authenticatedContext,
  type AuthenticatedRequest,
} from '../http/auth-http-context.js';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
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

    const required = this.reflector.getAllAndOverride<string>(
      REQUIRED_PERMISSION_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authenticated = authenticatedContext(request);
    if (
      !authenticated ||
      !(await this.permissions.hasPermission(authenticated.userId, required))
    ) {
      throw new ForbiddenException('Permission denied.');
    }
    return true;
  }
}
