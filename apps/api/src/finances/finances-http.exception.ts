import { HttpException, HttpStatus } from '@nestjs/common';
import type { FinancesPublicErrorCode } from '@sgi/contracts';

import { FinanceError } from './finance.errors.js';

export class FinancesHttpException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly publicCode: FinancesPublicErrorCode,
    readonly publicMessage: string,
  ) {
    super(publicMessage, status);
  }
}

function publicError(
  status: HttpStatus,
  code: FinancesPublicErrorCode,
  message: string,
): FinancesHttpException {
  return new FinancesHttpException(status, code, message);
}

/**
 * Map a typed finance failure to its HTTP status. Unexpected errors are
 * rethrown untouched: a constraint violation never becomes a success and is
 * never hidden.
 */
export function mapFinanceError(error: unknown): never {
  if (error instanceof FinanceError) {
    switch (error.code) {
      case 'FINANCE_REQUEST_INVALID':
        throw publicError(
          HttpStatus.BAD_REQUEST,
          'FINANCE_REQUEST_INVALID',
          'Finance request is invalid.',
        );
      case 'CLOSING_REQUEST_INVALID':
        throw publicError(
          HttpStatus.BAD_REQUEST,
          'CLOSING_REQUEST_INVALID',
          'Closing request is invalid.',
        );
      case 'FINANCE_PERMISSION_DENIED':
        throw publicError(
          HttpStatus.FORBIDDEN,
          'FINANCE_PERMISSION_DENIED',
          'Permission denied.',
        );
      case 'CLOSING_PERMISSION_DENIED':
        throw publicError(
          HttpStatus.FORBIDDEN,
          'CLOSING_PERMISSION_DENIED',
          'Permission denied.',
        );
      case 'CLOSING_NOT_FOUND':
        throw publicError(
          HttpStatus.NOT_FOUND,
          'CLOSING_NOT_FOUND',
          'Daily closing was not found.',
        );
      case 'CLOSING_ALREADY_EXISTS':
        throw publicError(
          HttpStatus.CONFLICT,
          'CLOSING_ALREADY_EXISTS',
          'A closing already exists for that business date.',
        );
      case 'CLOSING_ALREADY_REOPENED':
        throw publicError(
          HttpStatus.CONFLICT,
          'CLOSING_ALREADY_REOPENED',
          'The closing is not in a state that can be reopened.',
        );
      case 'CLOSING_REOPENING_WINDOW_EXPIRED':
        throw publicError(
          HttpStatus.CONFLICT,
          'CLOSING_REOPENING_WINDOW_EXPIRED',
          'The reopening window for that closing has expired.',
        );
      case 'FINANCE_CONCURRENCY_CONFLICT':
        throw publicError(
          HttpStatus.CONFLICT,
          'FINANCE_CONCURRENCY_CONFLICT',
          'Finance operation conflicted.',
        );
      case 'FINANCE_CATEGORY_INVALID':
        throw publicError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'FINANCE_CATEGORY_INVALID',
          'The category is unavailable or does not match the entry type.',
        );
      case 'FINANCE_RESPONSIBLE_INVALID':
        throw publicError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'FINANCE_RESPONSIBLE_INVALID',
          'The responsible user is unavailable.',
        );
    }
  }
  throw error;
}
