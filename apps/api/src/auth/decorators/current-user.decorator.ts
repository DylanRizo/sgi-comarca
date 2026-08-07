import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import {
  authenticatedContext,
  type AuthenticatedRequest,
  type AuthenticatedRequestContext,
} from '../http/auth-http-context.js';

export const CurrentUser = createParamDecorator(
  (
    _data: unknown,
    context: ExecutionContext,
  ): AuthenticatedRequestContext | undefined =>
    authenticatedContext(
      context.switchToHttp().getRequest<AuthenticatedRequest>(),
    ),
);
