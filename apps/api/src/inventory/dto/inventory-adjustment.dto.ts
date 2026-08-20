import { IsString, IsUUID, Matches, MaxLength } from 'class-validator';

const signedQuantity = /^[+-]?(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/u;

export class InventoryAdjustmentDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsString()
  @Matches(signedQuantity)
  quantityDelta!: string;

  @IsString()
  @MaxLength(500)
  @Matches(/\S/u)
  reason!: string;
}
