import { HttpStatus, type ArgumentsHost } from '@nestjs/common';
import type { ApiErrorBody } from '@sgi/contracts';
import { describe, expect, it, vi } from 'vitest';

import { AuthHttpException } from '../auth/http/auth-http.exception.js';
import { SalesHttpException } from '../sales/sales-http.exception.js';
import { GlobalExceptionFilter } from './global-exception.filter.js';

const detail = {
  productId: '11111111-1111-4111-8111-111111111111',
  warehouseId: '22222222-2222-4222-8222-222222222222',
};

/**
 * Drive the filter with a minimal Express double and return the body it wrote.
 */
function capture(exception: unknown): ApiErrorBody {
  const json = vi.fn();
  const response = {
    json,
    setHeader: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
  const request = { header: () => undefined, method: 'POST', path: '/x' };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  new GlobalExceptionFilter().catch(exception, host);

  expect(json).toHaveBeenCalledTimes(1);
  return json.mock.calls[0]?.[0] as ApiErrorBody;
}

describe('GlobalExceptionFilter details', () => {
  it('emits the failing pair for a sales 422 the plan §13 approved', () => {
    const body = capture(
      new SalesHttpException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'SALE_BALANCE_NOT_FOUND',
        'No inventory balance exists for a requested product and warehouse.',
        [detail],
      ),
    );

    expect(body.error.code).toBe('SALE_BALANCE_NOT_FOUND');
    expect(body.error.details).toEqual([detail]);
  });

  it('keeps details empty for a sales error carrying none', () => {
    const body = capture(
      new SalesHttpException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'SALE_INSUFFICIENT_STOCK',
        'Insufficient stock for the sale.',
      ),
    );

    expect(body.error.details).toEqual([]);
  });

  it('keeps details empty for a non-sales error', () => {
    const body = capture(
      new AuthHttpException(
        HttpStatus.UNAUTHORIZED,
        'AUTHENTICATION_REQUIRED',
        'Authentication is required.',
      ),
    );

    expect(body.error.details).toEqual([]);
  });

  it('never leaks internals for an unexpected error', () => {
    const body = capture(new Error('connect ECONNREFUSED 10.0.0.4:5432'));

    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.details).toEqual([]);
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });
});
