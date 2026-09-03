import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
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

  /**
   * Operational logistics. All optional: a counter sale has no courier and a
   * WhatsApp order may have no address yet.
   *
   * The three short texts mirror their VarChar columns so the database is
   * never the first thing to reject a value. Address and observations are
   * unbounded TEXT in PostgreSQL, so the caps here are the application's own
   * choice: an address or a note past these lengths is a mistake, not a
   * legitimate order.
   */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  salesChannelText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  delivererText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryPlace?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  paymentMethodText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observations?: string;

  @IsOptional()
  @IsISO8601()
  departureAt?: string;
}
