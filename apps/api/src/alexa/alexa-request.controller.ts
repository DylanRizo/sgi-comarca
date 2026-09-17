import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { AlexaResponseEnvelope } from '@sgi/alexa-adapter';
import type { ApiSuccess } from '@sgi/contracts';
import type { Request, Response } from 'express';

import { ExternalBearerRoute } from '../auth/decorators/external-bearer-route.decorator.js';
import { ServerToServerRoute } from '../auth/decorators/server-to-server-route.decorator.js';
import { readSuccess } from '../common/read-http.js';
import { AlexaAccessTokenGuard } from './alexa-access-token.guard.js';
import type { AlexaAuthenticatedContext } from './alexa-auth-context.js';
import { CurrentAlexaUser } from './current-alexa-user.decorator.js';
import { sanitizeAlexaEnvelope } from './alexa-request.parser.js';
import { AlexaRequestService } from './alexa-request.service.js';

@Controller({ path: 'alexa', version: '1' })
@ExternalBearerRoute()
@ServerToServerRoute()
@UseGuards(AlexaAccessTokenGuard)
export class AlexaRequestController {
  constructor(
    @Inject(AlexaRequestService)
    private readonly requests: AlexaRequestService,
  ) {}

  @Post('requests')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Body() input: unknown,
    @CurrentAlexaUser() current: AlexaAuthenticatedContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<AlexaResponseEnvelope>> {
    return readSuccess(
      await this.requests.handle(current, sanitizeAlexaEnvelope(input)),
      request,
      response,
    );
  }
}
