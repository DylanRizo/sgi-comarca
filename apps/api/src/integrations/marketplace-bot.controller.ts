import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type {
  ApiSuccess,
  MarketplaceBotCommandView,
  MarketplaceBotStateData,
} from '@sgi/contracts';
import type { Request, Response } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/http/auth-http-context.js';
import { readSuccess } from '../common/read-http.js';
// DTO values must remain runtime imports so Nest emits validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  EnqueueMarketplaceBotCommandDto,
  MarketplaceBotCommandIdParamDto,
  MarketplaceBotInstanceIdParamDto,
} from './dto/marketplace-bot.dto.js';
import { IntegrationKeyError } from './integration-key.errors.js';
import { MarketplaceBotService } from './marketplace-bot.service.js';

function mapBotError(error: unknown): never {
  if (error instanceof IntegrationKeyError) {
    const status =
      error.code === 'NOT_FOUND'
        ? HttpStatus.NOT_FOUND
        : error.code === 'ACCESS_DENIED'
          ? HttpStatus.FORBIDDEN
          : HttpStatus.BAD_REQUEST;
    throw new HttpException('Marketplace bot request failed.', status);
  }
  throw error;
}

/**
 * Signed-in web routes for Marketplace bot monitoring and remote commands.
 * Sellers (`sales.read`) may read telemetry and unanswered leads; queuing or
 * cancelling remote commands requires `integrations.manage`.
 */
@Controller({ path: 'integrations/marketplace-bot', version: '1' })
@RequirePermission('integrations.manage', 'sales.read')
export class MarketplaceBotController {
  constructor(
    @Inject(MarketplaceBotService)
    private readonly bots: MarketplaceBotService,
  ) {}

  @Get()
  async getState(
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<MarketplaceBotStateData>> {
    return readSuccess(
      await this.bots.getState(current.userId),
      request,
      response,
    );
  }

  @Post(':instanceId/commands')
  @RequirePermission('integrations.manage')
  @HttpCode(HttpStatus.CREATED)
  async enqueueCommand(
    @Param() params: MarketplaceBotInstanceIdParamDto,
    @Body() body: EnqueueMarketplaceBotCommandDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<MarketplaceBotCommandView>> {
    try {
      return readSuccess(
        await this.bots.enqueueCommand(
          current.userId,
          params.instanceId,
          body.command,
        ),
        request,
        response,
      );
    } catch (error) {
      mapBotError(error);
    }
  }

  @Post('commands/:commandId/cancel')
  @RequirePermission('integrations.manage')
  @HttpCode(HttpStatus.OK)
  async cancelCommand(
    @Param() params: MarketplaceBotCommandIdParamDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<MarketplaceBotCommandView>> {
    try {
      return readSuccess(
        await this.bots.cancelCommand(current.userId, params.commandId),
        request,
        response,
      );
    } catch (error) {
      mapBotError(error);
    }
  }
}
