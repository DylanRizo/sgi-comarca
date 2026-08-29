import { HttpException, HttpStatus } from '@nestjs/common';
import type { SalesPublicErrorCode } from '@sgi/contracts';

import { SaleError } from './sale.errors.js';

export class SalesHttpException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly publicCode: SalesPublicErrorCode,
    readonly publicMessage: string,
  ) {
    super(publicMessage, status);
  }
}

function publicError(
  status: HttpStatus,
  code: SalesPublicErrorCode,
  message: string,
): SalesHttpException {
  return new SalesHttpException(status, code, message);
}

/**
 * Map a typed sale domain failure to its approved HTTP status (plan §13).
 * Unexpected errors are rethrown untouched: a constraint violation never
 * becomes a success and is never hidden.
 */
export function mapSaleError(error: unknown): never {
  if (error instanceof SaleError) {
    switch (error.code) {
      case 'IDEMPOTENCY_KEY_INVALID':
        throw publicError(
          HttpStatus.BAD_REQUEST,
          'IDEMPOTENCY_KEY_INVALID',
          'Idempotency key is invalid.',
        );
      case 'IDEMPOTENCY_KEY_REQUIRED':
        throw publicError(
          HttpStatus.BAD_REQUEST,
          'IDEMPOTENCY_KEY_REQUIRED',
          'Idempotency key is required.',
        );
      case 'SALES_REQUEST_INVALID':
        throw publicError(
          HttpStatus.BAD_REQUEST,
          'SALES_REQUEST_INVALID',
          'Sale request is invalid.',
        );
      case 'SALES_PERMISSION_DENIED':
        throw publicError(
          HttpStatus.FORBIDDEN,
          'SALES_PERMISSION_DENIED',
          'Permission denied.',
        );
      case 'SALE_NOT_FOUND':
        throw publicError(
          HttpStatus.NOT_FOUND,
          'SALE_NOT_FOUND',
          'Sale was not found.',
        );
      case 'IDEMPOTENCY_KEY_REUSED':
        throw publicError(
          HttpStatus.CONFLICT,
          'IDEMPOTENCY_KEY_REUSED',
          'Idempotency key was reused with a different payload.',
        );
      case 'SALE_INVALID_STATE':
        throw publicError(
          HttpStatus.CONFLICT,
          'SALE_INVALID_STATE',
          'Sale is not in a valid state.',
        );
      case 'SALE_CONCURRENCY_CONFLICT':
        throw publicError(
          HttpStatus.CONFLICT,
          'SALE_CONCURRENCY_CONFLICT',
          'Sale operation conflicted.',
        );
      case 'SALE_BALANCE_NOT_FOUND':
        throw publicError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'SALE_BALANCE_NOT_FOUND',
          'No inventory balance exists for a requested product and warehouse.',
        );
      case 'SALE_COST_MISSING':
        throw publicError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'SALE_COST_MISSING',
          'Current unit cost is missing.',
        );
      case 'SALE_PRICE_MISSING':
        throw publicError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'SALE_PRICE_MISSING',
          'No usable unit price is available.',
        );
      case 'SALE_REFERENCE_VALUE_INVALID':
        throw publicError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'SALE_REFERENCE_VALUE_INVALID',
          'A stored reference value is out of range.',
        );
      case 'SALE_INSUFFICIENT_STOCK':
        throw publicError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'SALE_INSUFFICIENT_STOCK',
          'Insufficient stock for the sale.',
        );
      case 'SALE_PRODUCT_UNAVAILABLE':
        throw publicError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'SALE_PRODUCT_UNAVAILABLE',
          'A product is not available.',
        );
      case 'SALE_WAREHOUSE_UNAVAILABLE':
        throw publicError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'SALE_WAREHOUSE_UNAVAILABLE',
          'A warehouse is not available.',
        );
    }
  }
  throw error;
}
