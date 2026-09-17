import { HttpException } from '@nestjs/common';
import type { StockOperationErrorCode } from '@sgi/contracts';
import { StockOperationError } from '../inventory/stock-command.js';

export class StockOperationHttpException extends HttpException {
  constructor(
    readonly publicCode: StockOperationErrorCode,
    readonly publicMessage: string,
    status: number,
  ) {
    super(publicMessage, status);
  }
}
const errors: Record<StockOperationErrorCode, [number, string]> = {
  STOCK_REQUEST_INVALID: [
    400,
    'Revisa los datos, las cantidades y los importes.',
  ],
  PRODUCT_CODE_DUPLICATE: [
    409,
    'Ya existe un producto con ese código. Selecciónalo para registrar una entrada.',
  ],
  PRODUCT_HISTORY_LOCKED: [
    409,
    'El producto tiene historial. Su código y unidad no pueden cambiarse.',
  ],
  STOCK_RESOURCE_NOT_FOUND: [
    404,
    'El producto, la bodega o el catálogo ya no está disponible. Actualiza la vista.',
  ],
  STOCK_PERMISSION_DENIED: [
    403,
    'No tienes permiso para realizar esta operación.',
  ],
  STOCK_OPERATION_CONFLICT: [
    409,
    'Otra persona modificó estos datos. Actualiza la vista antes de continuar.',
  ],
  IDEMPOTENCY_KEY_REQUIRED: [400, 'Falta la identificación de la operación.'],
  IDEMPOTENCY_KEY_INVALID: [
    400,
    'La identificación de la operación no es válida.',
  ],
  IDEMPOTENCY_KEY_REUSED: [
    409,
    'Este intento corresponde a otros datos. Inicia una nueva operación.',
  ],
};
export function mapStockOperationError(error: unknown): never {
  if (error instanceof StockOperationError) {
    const [status, message] = errors[error.code];
    throw new StockOperationHttpException(error.code, message, status);
  }
  throw error;
}
