import { ValidationPipe } from '@nestjs/common';
import type { SalePaymentStatus, SaleStatus } from '@sgi/contracts';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/read-query.dto.js';

const supportedSaleStatuses = [
  'LEGACY_UNKNOWN',
  'IN_TRANSIT',
  'COMPLETED',
  'CANCELLED',
] as const satisfies readonly SaleStatus[];

const supportedPaymentStatuses = [
  'UNKNOWN',
  'PENDING',
  'PAID',
] as const satisfies readonly SalePaymentStatus[];

export class SaleQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(supportedSaleStatuses)
  status?: SaleStatus;

  @IsOptional()
  @IsIn(supportedPaymentStatuses)
  paymentStatus?: SalePaymentStatus;

  /** Inclusive civil-date lower bound, `YYYY-MM-DD`. */
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  /** Inclusive civil-date upper bound, `YYYY-MM-DD`. */
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @IsOptional()
  @IsUUID()
  sellerUserId?: string;

  /** Matches sales having at least one item in this warehouse. */
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

export class SaleIdParamDto {
  @IsUUID()
  id!: string;
}

export const saleQueryPipe = new ValidationPipe({
  expectedType: SaleQueryDto,
  forbidNonWhitelisted: true,
  transform: true,
  whitelist: true,
});
