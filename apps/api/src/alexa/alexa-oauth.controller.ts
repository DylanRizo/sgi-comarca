import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type {
  AlexaAuthorizationData,
  AlexaLinkStatusData,
  ApiSuccess,
} from '@sgi/contracts';
import type { Request, Response } from 'express';

import type { AuthenticatedRequestContext } from '../auth/http/auth-http-context.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { PublicRoute } from '../auth/decorators/public-route.decorator.js';
import { ServerToServerRoute } from '../auth/decorators/server-to-server-route.decorator.js';
import { readSuccess } from '../common/read-http.js';
import { AlexaOAuthError } from './alexa-oauth.errors.js';
import { AlexaOAuthService } from './alexa-oauth.service.js';
// DTO values must remain runtime imports so Nest emits validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  AlexaAuthorizationDto,
  AlexaTokenRequestError,
  parseAlexaTokenDto,
} from './dto/alexa-oauth.dto.js';

@Controller({ path: 'alexa/oauth', version: '1' })
export class AlexaOAuthController {
  constructor(
    @Inject(AlexaOAuthService)
    private readonly oauth: AlexaOAuthService,
  ) {}

  @Post('authorize')
  @HttpCode(HttpStatus.OK)
  async authorize(
    @Body() input: AlexaAuthorizationDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<AlexaAuthorizationData>> {
    try {
      return readSuccess(
        await this.oauth.authorize(current.userId, input),
        request,
        response,
      );
    } catch (error) {
      if (error instanceof AlexaOAuthError) {
        const status =
          error.code === 'ACCESS_DENIED'
            ? HttpStatus.FORBIDDEN
            : error.code === 'INTEGRATION_DISABLED'
              ? HttpStatus.SERVICE_UNAVAILABLE
              : HttpStatus.BAD_REQUEST;
        throw new HttpException('Alexa account linking failed.', status);
      }
      throw error;
    }
  }

  @Get('status')
  async status(
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<AlexaLinkStatusData>> {
    const status = await this.oauth.status(current.userId);
    return readSuccess(status as AlexaLinkStatusData, request, response);
  }

  @Post('revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @CurrentUser() current: AuthenticatedRequestContext,
  ): Promise<void> {
    await this.oauth.revoke(current.userId);
  }

  @Post('token')
  @PublicRoute()
  @ServerToServerRoute()
  @HttpCode(HttpStatus.OK)
  async token(
    @Body() input: unknown,
    @Res() response: Response,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    try {
      response
        .status(HttpStatus.OK)
        .json(await this.oauth.exchange(parseAlexaTokenDto(input)));
    } catch (error) {
      if (
        !(error instanceof AlexaOAuthError) &&
        !(error instanceof AlexaTokenRequestError)
      ) {
        throw error;
      }
      const oauthError =
        error instanceof AlexaOAuthError
          ? error
          : new AlexaOAuthError('INVALID_REQUEST');
      const status =
        oauthError.code === 'INVALID_CLIENT'
          ? HttpStatus.UNAUTHORIZED
          : oauthError.code === 'INTEGRATION_DISABLED'
            ? HttpStatus.SERVICE_UNAVAILABLE
            : HttpStatus.BAD_REQUEST;
      const oauthCode =
        oauthError.code === 'INVALID_CLIENT'
          ? 'invalid_client'
          : oauthError.code === 'INVALID_GRANT'
            ? 'invalid_grant'
            : oauthError.code === 'INTEGRATION_DISABLED'
              ? 'temporarily_unavailable'
              : 'invalid_request';
      response.status(status).json({ error: oauthCode });
    }
  }
}
