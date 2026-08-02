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

    if (internalError) {
      this.logger.error({
        error:
          exception instanceof Error ? exception.message : 'Unknown exception',
        method: request.method,
        path: request.originalUrl,
        requestId,
      });
    }

    const body: ApiErrorBody = {
      error: {
        code: internalError ? 'INTERNAL_ERROR' : 'REQUEST_FAILED',
        details: [],
        message: internalError
          ? 'Ocurrió un error interno.'
          : 'La solicitud no pudo procesarse.',
        requestId,
      },
    };

    response.status(status).setHeader('x-request-id', requestId).json(body);
  }

  private readRequestId(request: Request): string {
    const value = request.header('x-request-id')?.trim();
    return value && value.length <= 128 ? value : randomUUID();
  }
}
