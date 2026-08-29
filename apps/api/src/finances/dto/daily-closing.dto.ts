import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const nonNegativeMoney = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/u;
const businessDate = /^\d{4}-\d{2}-\d{2}$/u;

export class CreateDailyClosingDto {
  @IsString()
  @Matches(businessDate)
  businessDate!: string;

  @IsString()
  @Matches(nonNegativeMoney)
  realCash!: string;

  @IsString()
  @Matches(nonNegativeMoney)
  realDigital!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observations?: string;
}

export class ReopenDailyClosingDto {
  @IsString()
  @MaxLength(500)
  @Matches(/\S/u)
  reason!: string;
}
