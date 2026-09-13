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
  CreatedIntegrationKeyData,
  IntegrationKeySummary,
} from '@sgi/contracts';
import type { Request, Response } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/http/auth-http-context.js';
import { readSuccess } from '../common/read-http.js';
// DTO values must remain runtime imports so Nest emits validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  CreateIntegrationKeyDto,
  IntegrationKeyIdParamDto,
} from './dto/integration-key.dto.js';
import { IntegrationKeyError } from './integration-key.errors.js';
import { IntegrationKeyService } from './integration-key.service.js';

function mapIntegrationKeyError(error: unknown): never {
  if (error instanceof IntegrationKeyError) {
    const status =
      error.code === 'NOT_FOUND'
        ? HttpStatus.NOT_FOUND
        : error.code === 'ACCESS_DENIED'
          ? HttpStatus.FORBIDDEN
          : error.code === 'INTEGRATION_DISABLED'
            ? HttpStatus.SERVICE_UNAVAILABLE
            : HttpStatus.BAD_REQUEST;
    throw new HttpException('Integration key request failed.', status);
  }
  throw error;
}

/** Managed from a signed-in session, so the global session and CSRF guards apply. */
@Controller({ path: 'integrations/keys', version: '1' })
@RequirePermission('integrations.manage')
export class IntegrationKeysController {
  constructor(
    @Inject(IntegrationKeyService)
    private readonly keys: IntegrationKeyService,
  ) {}

  @Get()
  async list(
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<readonly IntegrationKeySummary[]>> {
    return readSuccess(await this.keys.list(current.userId), request, response);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() input: CreateIntegrationKeyDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<CreatedIntegrationKeyData>> {
    try {
      return readSuccess(
        await this.keys.create(current.userId, input),
        request,
        response,
      );
    } catch (error) {
      mapIntegrationKeyError(error);
    }
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param() params: IntegrationKeyIdParamDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<IntegrationKeySummary>> {
    try {
      return readSuccess(
        await this.keys.revoke(current.userId, params.id),
        request,
        response,
      );
    } catch (error) {
      mapIntegrationKeyError(error);
    }
  }
}
