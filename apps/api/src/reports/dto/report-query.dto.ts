import { ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const isoDate = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Reports paginate on the server like every other read surface. The page size
 * ceiling is deliberately the same 100 as the rest of the API; CSV export
 * raises it to a bounded maximum rather than streaming an unbounded result.
 */
export class ReportQueryDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize = 25;

  @IsOptional()
  @IsIn(['csv', 'json'])
  format?: 'csv' | 'json';

  @IsOptional()
  @IsString()
  @Matches(isoDate, { message: 'from must be an ISO date (YYYY-MM-DD).' })
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(isoDate, { message: 'to must be an ISO date (YYYY-MM-DD).' })
  to?: string;
}

export class InventoryReportQueryDto extends ReportQueryDto {
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class MovementReportQueryDto extends ReportQueryDto {
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsIn([
    'ADJUSTMENT',
    'INITIAL_BALANCE',
    'LEGACY',
    'RECEIPT',
    'SALE',
    'SALE_CANCELLATION',
    'TRANSFER_IN',
    'TRANSFER_OUT',
  ])
  type?: string;
}

export class SalesReportQueryDto extends ReportQueryDto {
  @IsOptional()
  @IsIn(['CANCELLED', 'COMPLETED', 'IN_TRANSIT', 'LEGACY_UNKNOWN'])
  status?: string;

  @IsOptional()
  @IsUUID()
  sellerUserId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

export class FinanceReportQueryDto extends ReportQueryDto {
  @IsOptional()
  @IsIn(['EXPENSE', 'INCOME'])
  entryType?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsIn(['LEGACY_IMPORT', 'OPERATIONAL'])
  origin?: string;
}

function reportQueryPipe(expectedType: new () => object): ValidationPipe {
  return new ValidationPipe({
    expectedType,
    forbidNonWhitelisted: true,
    transform: true,
    whitelist: true,
  });
}

export const inventoryReportQueryPipe = reportQueryPipe(
  InventoryReportQueryDto,
);
export const movementReportQueryPipe = reportQueryPipe(MovementReportQueryDto);
export const salesReportQueryPipe = reportQueryPipe(SalesReportQueryDto);
export const financeReportQueryPipe = reportQueryPipe(FinanceReportQueryDto);
