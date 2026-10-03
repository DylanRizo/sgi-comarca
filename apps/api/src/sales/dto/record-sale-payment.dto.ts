import { IsString, Matches, MaxLength } from 'class-validator';

export class RecordSalePaymentDto {
  @IsString()
  @MaxLength(160)
  @Matches(/\S/u)
  paymentMethodText!: string;
}
