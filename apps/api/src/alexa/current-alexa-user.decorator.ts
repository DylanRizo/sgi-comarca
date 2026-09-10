import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import {
  alexaAuthenticatedContext,
  type AlexaAuthenticatedRequest,
} from './alexa-auth-context.js';

export const CurrentAlexaUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    alexaAuthenticatedContext(
      context.switchToHttp().getRequest<AlexaAuthenticatedRequest>(),
    ),
);
