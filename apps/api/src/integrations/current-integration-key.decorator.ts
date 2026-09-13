import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';

import {
  integrationContext,
  type IntegrationAuthenticatedRequest,
} from './integration-auth-context.js';
import type { ValidIntegrationKey } from './integration-key.service.js';

export const CurrentIntegrationKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ValidIntegrationKey => {
    const current = integrationContext(
      context.switchToHttp().getRequest<IntegrationAuthenticatedRequest>(),
    );
    // Only reachable if a route forgot the guard; fail closed.
    if (!current) throw new UnauthorizedException();
    return current;
  },
);
