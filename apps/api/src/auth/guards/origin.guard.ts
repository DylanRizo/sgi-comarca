import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

import { OriginPolicyService } from '../http/origin-policy.service.js';

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    @Inject(OriginPolicyService)
    private readonly policy: OriginPolicyService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    this.policy.assertRequestAllowed(
      context.switchToHttp().getRequest<Request>(),
    );
    return true;
  }
}
