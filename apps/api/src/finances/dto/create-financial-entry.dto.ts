import type { FinancialEntryType } from '@sgi/contracts';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const positiveMoney = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/u;
const businessDate = /^\d{4}-\d{2}-\d{2}$/u;

const entryTypes = [
  'INCOME',
  'EXPENSE',
] as const satisfies readonly FinancialEntryType[];

export class CreateFinancialEntryDto {
  @IsString()
  @Matches(businessDate)
  businessDate!: string;

  @IsIn(entryTypes)
  entryType!: FinancialEntryType;

  @IsUUID()
  categoryId!: string;

  /** Must be greater than zero; the domain layer rejects an exact zero. */
  @IsString()
  @Matches(positiveMoney)
  amount!: string;

  @IsUUID()
  responsibleUserId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
