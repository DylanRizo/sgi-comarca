import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import type { SaleCreationStatus } from '@sgi/contracts';

const positiveQuantity = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/u;
const nonNegativeMoney = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/u;
const businessDate = /^\d{4}-\d{2}-\d{2}$/u;

const creationStatuses = [
  'IN_TRANSIT',
  'COMPLETED',
] as const satisfies readonly SaleCreationStatus[];

export class CreateSaleItemDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsString()
  @Matches(positiveQuantity)
  quantity!: string;

  /** Optional non-negative override; omission uses the balance reference. */
  @IsOptional()
  @IsString()
  @Matches(nonNegativeMoney)
  unitPrice?: string;
}

export class CreateSaleDto {
  @IsString()
  @Matches(businessDate)
  businessDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];

  @IsOptional()
  @IsUUID()
  sellerUserId?: string;

  @IsOptional()
  @IsString()
  @Matches(nonNegativeMoney)
  shippingAmount?: string;

  @IsIn(creationStatuses)
  status!: SaleCreationStatus;
}
