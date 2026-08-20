import { HttpException, HttpStatus } from '@nestjs/common';
import type {
  InventoryAdjustmentPublicErrorCode,
  InventoryTransferPublicErrorCode,
} from '@sgi/contracts';

type InventoryPublicErrorCode =
  InventoryAdjustmentPublicErrorCode | InventoryTransferPublicErrorCode;

export class InventoryHttpException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly publicCode: InventoryPublicErrorCode,
    readonly publicMessage: string,
  ) {
    super(publicMessage, status);
  }

  static adjustmentConflict(): InventoryHttpException {
    return new InventoryHttpException(
      HttpStatus.CONFLICT,
      'INVENTORY_ADJUSTMENT_CONFLICT',
      'El ajuste entro en conflicto con otra operacion.',
    );
  }

  static adjustmentInvalid(): InventoryHttpException {
    return new InventoryHttpException(
      HttpStatus.BAD_REQUEST,
      'INVENTORY_ADJUSTMENT_INVALID',
      'El ajuste solicitado no es valido.',
    );
  }

  static balanceNotFound(): InventoryHttpException {
    return new InventoryHttpException(
      HttpStatus.NOT_FOUND,
      'INVENTORY_BALANCE_NOT_FOUND',
      'No se encontro el saldo solicitado.',
    );
  }

  static negativeBalance(): InventoryHttpException {
    return new InventoryHttpException(
      HttpStatus.CONFLICT,
      'INVENTORY_NEGATIVE_BALANCE',
      'El ajuste produciria inventario negativo.',
    );
  }

  static productNotFound(): InventoryHttpException {
    return new InventoryHttpException(
      HttpStatus.NOT_FOUND,
      'INVENTORY_PRODUCT_NOT_FOUND',
      'No se encontro el producto solicitado.',
    );
  }

  static warehouseNotFound(): InventoryHttpException {
    return new InventoryHttpException(
      HttpStatus.NOT_FOUND,
      'INVENTORY_WAREHOUSE_NOT_FOUND',
      'No se encontro el almacen solicitado.',
    );
  }

  static idempotencyKeyInvalid(): InventoryHttpException {
    return new InventoryHttpException(
      HttpStatus.BAD_REQUEST,
      'IDEMPOTENCY_KEY_INVALID',
      'La clave de idempotencia no es valida.',
    );
  }

  static idempotencyKeyRequired(): InventoryHttpException {
    return new InventoryHttpException(
      HttpStatus.BAD_REQUEST,
      'IDEMPOTENCY_KEY_REQUIRED',
      'La clave de idempotencia es obligatoria.',
    );
  }

  static idempotencyKeyReused(): InventoryHttpException {
    return new InventoryHttpException(
      HttpStatus.CONFLICT,
      'IDEMPOTENCY_KEY_REUSED',
      'La clave de idempotencia ya fue usada para otra solicitud.',
    );
  }

  static transferConflict(): InventoryHttpException {
    return new InventoryHttpException(
      HttpStatus.CONFLICT,
      'INVENTORY_TRANSFER_CONFLICT',
      'La transferencia entro en conflicto con otra operacion.',
    );
  }

  static transferInsufficientStock(): InventoryHttpException {
    return new InventoryHttpException(
      HttpStatus.CONFLICT,
      'INVENTORY_TRANSFER_INSUFFICIENT_STOCK',
      'No hay inventario suficiente en el almacen de origen.',
    );
  }

  static transferInvalid(): InventoryHttpException {
    return new InventoryHttpException(
      HttpStatus.BAD_REQUEST,
      'INVENTORY_TRANSFER_INVALID',
      'La transferencia solicitada no es valida.',
    );
  }

  static transferProductNotFound(): InventoryHttpException {
    return new InventoryHttpException(
      HttpStatus.NOT_FOUND,
      'INVENTORY_TRANSFER_PRODUCT_NOT_FOUND',
      'No se encontro el producto solicitado.',
    );
  }

  static transferSourceBalanceNotFound(): InventoryHttpException {
    return new InventoryHttpException(
      HttpStatus.NOT_FOUND,
      'INVENTORY_TRANSFER_SOURCE_BALANCE_NOT_FOUND',
      'No se encontro el saldo del almacen de origen.',
    );
  }

  static transferWarehouseNotFound(): InventoryHttpException {
    return new InventoryHttpException(
      HttpStatus.NOT_FOUND,
      'INVENTORY_TRANSFER_WAREHOUSE_NOT_FOUND',
      'No se encontro uno de los almacenes solicitados.',
    );
  }
}
