import { Equals, IsString, Matches, MaxLength } from 'class-validator';

export class VoidDuplicateSaleDto {
  @IsString()
  @Matches(/^VTA-[0-9]{9}$/u)
  replacementSaleNumber!: string;

  @IsString()
  @MaxLength(500)
  @Matches(/\S/u)
  reason!: string;

  @Equals(true)
  stockReturned!: true;
}
