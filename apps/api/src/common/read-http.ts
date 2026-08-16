import { NotFoundException } from '@nestjs/common';
import type { ApiSuccess } from '@sgi/contracts';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export class ReadModelNotFoundError extends Error {
  constructor(readonly resource: 'product' | 'unit' | 'warehouse') {
    super('Requested read model was not found.');
    this.name = 'ReadModelNotFoundError';
  }
}

export function mapReadModelError(error: unknown): never {
  if (error instanceof ReadModelNotFoundError) {
    throw new NotFoundException('Requested resource was not found.');
  }
  throw error;
}

export function readSuccess<T>(
  data: T,
  request: Request,
  response: Response,
): ApiSuccess<T> {
  const suppliedRequestId = request.header('x-request-id')?.trim();
  const requestId =
    suppliedRequestId && suppliedRequestId.length <= 128
      ? suppliedRequestId
      : randomUUID();
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('x-request-id', requestId);
  return { data, meta: { requestId } };
}
