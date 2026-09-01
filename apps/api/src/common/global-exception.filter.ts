import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiErrorBody } from '@sgi/contracts';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

import { AuthHttpException } from '../auth/http/auth-http.exception.js';
import { FinancesHttpException } from '../finances/finances-http.exception.js';
import { InventoryHttpException } from '../inventory/inventory-http.exception.js';
import { SalesHttpException } from '../sales/sales-http.exception.js';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = this.readRequestId(request);
    const internalError = status >= HttpStatus.INTERNAL_SERVER_ERROR;
    const authenticationFailure =
      status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN;
    const publicError =
      exception instanceof AuthHttpException ||
      exception instanceof FinancesHttpException ||
      exception instanceof InventoryHttpException ||
      exception instanceof SalesHttpException
        ? exception
        : null;
    const invalidRequest = status === HttpStatus.BAD_REQUEST;

    if (internalError) {
      this.logger.error({
        errorType:
          exception instanceof Error ? exception.constructor.name : 'Unknown',
        method: request.method,
        path: request.path,
        requestId,
      });
    }

    const body: ApiErrorBody = {
      error: {
        code: publicError
          ? publicError.publicCode
          : internalError
            ? 'INTERNAL_ERROR'
            : invalidRequest
              ? 'INVALID_REQUEST'
              : authenticationFailure
                ? 'ACCESS_DENIED'
                : 'REQUEST_FAILED',
        // Only the sales 422s the FASE 7B plan §13 approved carry details, and
        // they carry just the caller's own product/warehouse identifiers. Every
        // other error keeps an empty array so the body has one shape.
        details:
          publicError instanceof SalesHttpException
            ? publicError.publicDetails
            : [],
        message: publicError
          ? publicError.publicMessage
          : internalError
            ? 'Ocurrio un error interno.'
            : invalidRequest
              ? 'La solicitud no es valida.'
              : authenticationFailure
                ? 'No fue posible autorizar la solicitud.'
                : 'La solicitud no pudo procesarse.',
        requestId,
      },
    };

    response
      .status(status)
      .setHeader('Cache-Control', 'no-store')
      .setHeader('x-request-id', requestId)
      .json(body);
  }

  private readRequestId(request: Request): string {
    const value = request.header('x-request-id')?.trim();
    return value && value.length <= 128 ? value : randomUUID();
  }
}
