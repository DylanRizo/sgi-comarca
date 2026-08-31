import { HttpException, HttpStatus } from '@nestjs/common';
import type { InventoryCountPublicErrorCode } from '@sgi/contracts';

import { InventoryCountError } from './inventory-count.errors.js';

export class InventoryCountHttpException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly publicCode: InventoryCountPublicErrorCode,
    readonly publicMessage: string,
  ) {
    super(publicMessage, status);
  }
}

function publicError(
  status: HttpStatus,
  code: InventoryCountPublicErrorCode,
  message: string,
): InventoryCountHttpException {
  return new InventoryCountHttpException(status, code, message);
}

/**
 * Map a typed physical-count failure to its HTTP status. Unexpected errors are
 * rethrown untouched: a constraint violation never becomes a success.
 */
export function mapInventoryCountError(error: unknown): never {
  if (error instanceof InventoryCountError) {
    switch (error.code) {
      case 'IDEMPOTENCY_KEY_INVALID':
        throw publicError(
          HttpStatus.BAD_REQUEST,
          'IDEMPOTENCY_KEY_INVALID',
          'La clave de idempotencia no es valida.',
        );
      case 'IDEMPOTENCY_KEY_REQUIRED':
        throw publicError(
          HttpStatus.BAD_REQUEST,
          'IDEMPOTENCY_KEY_REQUIRED',
          'La clave de idempotencia es obligatoria.',
        );
      case 'INVENTORY_COUNT_REQUEST_INVALID':
        throw publicError(
          HttpStatus.BAD_REQUEST,
          'INVENTORY_COUNT_REQUEST_INVALID',
          'La solicitud de conteo no es valida.',
        );
      case 'INVENTORY_COUNT_PERMISSION_DENIED':
        throw publicError(
          HttpStatus.FORBIDDEN,
          'INVENTORY_COUNT_PERMISSION_DENIED',
          'Permiso denegado.',
        );
      case 'INVENTORY_COUNT_APPROVER_CANNOT_ADJUST':
        throw publicError(
          HttpStatus.FORBIDDEN,
          'INVENTORY_COUNT_APPROVER_CANNOT_ADJUST',
          'Aprobar un conteo requiere ademas el permiso de ajuste de inventario.',
        );
      case 'INVENTORY_COUNT_SESSION_NOT_FOUND':
        throw publicError(
          HttpStatus.NOT_FOUND,
          'INVENTORY_COUNT_SESSION_NOT_FOUND',
          'No se encontro la sesion de conteo solicitada.',
        );
      case 'INVENTORY_COUNT_PRODUCT_NOT_FOUND':
        throw publicError(
          HttpStatus.NOT_FOUND,
          'INVENTORY_COUNT_PRODUCT_NOT_FOUND',
          'No se encontro el producto solicitado.',
        );
      case 'INVENTORY_COUNT_WAREHOUSE_NOT_FOUND':
        throw publicError(
          HttpStatus.NOT_FOUND,
          'INVENTORY_COUNT_WAREHOUSE_NOT_FOUND',
          'No se encontro uno de los almacenes solicitados.',
        );
      case 'IDEMPOTENCY_KEY_REUSED':
        throw publicError(
          HttpStatus.CONFLICT,
          'IDEMPOTENCY_KEY_REUSED',
          'La clave de idempotencia ya fue usada para otra solicitud.',
        );
      case 'INVENTORY_COUNT_INVALID_STATE':
        throw publicError(
          HttpStatus.CONFLICT,
          'INVENTORY_COUNT_INVALID_STATE',
          'La sesion de conteo no esta en un estado valido.',
        );
      case 'INVENTORY_COUNT_LINE_ALREADY_CAPTURED':
        throw publicError(
          HttpStatus.CONFLICT,
          'INVENTORY_COUNT_LINE_ALREADY_CAPTURED',
          'El conteo de ese producto y almacen ya fue capturado.',
        );
      case 'INVENTORY_COUNT_BALANCE_CHANGED':
        throw publicError(
          HttpStatus.CONFLICT,
          'INVENTORY_COUNT_BALANCE_CHANGED',
          'El inventario cambio despues del conteo; la sesion debe repetirse.',
        );
      case 'INVENTORY_COUNT_CONFLICT':
        throw publicError(
          HttpStatus.CONFLICT,
          'INVENTORY_COUNT_CONFLICT',
          'La operacion de conteo entro en conflicto con otra.',
        );
      case 'INVENTORY_COUNT_NEGATIVE_BALANCE':
        throw publicError(
          HttpStatus.CONFLICT,
          'INVENTORY_COUNT_NEGATIVE_BALANCE',
          'El conteo produciria inventario negativo.',
        );
      case 'INVENTORY_COUNT_REQUIRES_LINES':
        throw publicError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'INVENTORY_COUNT_REQUIRES_LINES',
          'La sesion de conteo requiere al menos una linea.',
        );
      case 'INVENTORY_COUNT_WAREHOUSE_OUT_OF_SCOPE':
        throw publicError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'INVENTORY_COUNT_WAREHOUSE_OUT_OF_SCOPE',
          'El almacen no forma parte del alcance de la sesion.',
        );
      case 'INVENTORY_COUNT_ADJUSTMENT_FAILED':
        throw publicError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'INVENTORY_COUNT_ADJUSTMENT_FAILED',
          'No se pudo generar el ajuste del conteo.',
        );
    }
  }
  throw error;
}
