import { IsString, IsUUID, Matches, MaxLength } from 'class-validator';

const positiveQuantity = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/u;

export class InventoryTransferDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  fromWarehouseId!: string;

  @IsUUID()
  toWarehouseId!: string;

  @IsString()
  @Matches(positiveQuantity)
  quantity!: string;

  @IsString()
  @MaxLength(500)
  @Matches(/\S/u)
  reason!: string;
}
