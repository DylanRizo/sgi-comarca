import { IsString, Matches, MaxLength } from 'class-validator';

export class CancelSaleDto {
  @IsString()
  @MaxLength(500)
  @Matches(/\S/u)
  reason!: string;
}
