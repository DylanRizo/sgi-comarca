import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { ApiSuccess, MarketplaceBotSyncData } from '@sgi/contracts';
import type { Request, Response } from 'express';

import { ExternalBearerRoute } from '../auth/decorators/external-bearer-route.decorator.js';
import { ServerToServerRoute } from '../auth/decorators/server-to-server-route.decorator.js';
import { readSuccess } from '../common/read-http.js';
import { CurrentIntegrationKey } from './current-integration-key.decorator.js';
// DTO values must remain runtime imports so Nest emits validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MarketplaceBotSyncDto } from './dto/marketplace-bot.dto.js';
import { IntegrationKeyError } from './integration-key.errors.js';
import {
  IntegrationKeyGuard,
  RequireIntegrationKeyScope,
} from './integration-key.guard.js';
import type { ValidIntegrationKey } from './integration-key.service.js';
import { MarketplaceBotService } from './marketplace-bot.service.js';

function mapBotSyncError(error: unknown): never {
  if (error instanceof IntegrationKeyError) {
    const status =
      error.code === 'ACCESS_DENIED'
        ? HttpStatus.FORBIDDEN
        : error.code === 'INVALID_KEY'
          ? HttpStatus.UNAUTHORIZED
          : HttpStatus.BAD_REQUEST;
    throw new HttpException('Marketplace bot sync request failed.', status);
  }
  throw error;
}

/**
 * Machine-to-machine endpoint called by the local Marketplace bot worker
 * with its integration key (`Authorization: Bearer <key>`).
 */
@Controller({ path: 'integrations/marketplace-bot', version: '1' })
@ExternalBearerRoute()
@ServerToServerRoute()
@RequireIntegrationKeyScope('marketplace-bot.sync')
@UseGuards(IntegrationKeyGuard)
export class MarketplaceBotSyncController {
  constructor(
    @Inject(MarketplaceBotService)
    private readonly bots: MarketplaceBotService,
  ) {}

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async sync(
    @Body() input: MarketplaceBotSyncDto,
    @CurrentIntegrationKey() current: ValidIntegrationKey,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<MarketplaceBotSyncData>> {
    try {
      const data = await this.bots.syncFromBot(current, input);
      return readSuccess(data, request, response);
    } catch (error) {
      mapBotSyncError(error);
    }
  }
}
