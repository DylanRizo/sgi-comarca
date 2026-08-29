import { ValidationPipe } from '@nestjs/common';
import type {
  DailyClosingStatus,
  FinanceLineSource,
  FinancialEntryType,
} from '@sgi/contracts';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/read-query.dto.js';

const entryTypes = [
  'INCOME',
  'EXPENSE',
] as const satisfies readonly FinancialEntryType[];

const lineSources = [
  'MANUAL',
  'SALE',
] as const satisfies readonly FinanceLineSource[];

const closingStatuses = [
  'CLOSED',
  'REOPENED',
] as const satisfies readonly DailyClosingStatus[];

export class FinanceLineQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(entryTypes)
  entryType?: FinancialEntryType;

  /** MANUAL keeps persisted entries; SALE keeps income derived from sales. */
  @IsOptional()
  @IsIn(lineSources)
  source?: FinanceLineSource;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

export class DailyClosingQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(closingStatuses)
  status?: DailyClosingStatus;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

export class FinanceIdParamDto {
  @IsUUID()
  id!: string;
}

export const financeLineQueryPipe = new ValidationPipe({
  expectedType: FinanceLineQueryDto,
  forbidNonWhitelisted: true,
  transform: true,
  whitelist: true,
});

export const dailyClosingQueryPipe = new ValidationPipe({
  expectedType: DailyClosingQueryDto,
  forbidNonWhitelisted: true,
  transform: true,
  whitelist: true,
});
