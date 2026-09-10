import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { SERVER_TO_SERVER_ROUTE_METADATA } from '../decorators/server-to-server-route.decorator.js';
import { OriginPolicyService } from '../http/origin-policy.service.js';

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(OriginPolicyService)
    private readonly policy: OriginPolicyService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const serverToServer = this.reflector.getAllAndOverride<boolean>(
      SERVER_TO_SERVER_ROUTE_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (serverToServer) this.policy.assertHostAllowed(request);
    else this.policy.assertRequestAllowed(request);
    return true;
  }
}
