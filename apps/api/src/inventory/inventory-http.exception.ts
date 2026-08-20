import { HttpException, HttpStatus } from '@nestjs/common';
import type { InventoryAdjustmentPublicErrorCode } from '@sgi/contracts';

export class InventoryHttpException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly publicCode: InventoryAdjustmentPublicErrorCode,
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
}
