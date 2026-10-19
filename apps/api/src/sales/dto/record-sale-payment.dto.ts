import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const positiveMoney = /^(?:[1-9]\d*|0\.\d{1,2}|[1-9]\d*\.\d{1,2})$/u;

export class SplitPaymentLineDto {
  @IsString()
  @MaxLength(160)
  @Matches(/\S/u, { message: 'El método de pago no puede estar vacío.' })
  methodText!: string;

  @IsString()
  @Matches(positiveMoney, {
    message:
      'El monto debe ser un valor monetario mayor a cero con hasta 2 decimales.',
  })
  amount!: string;
}

export class RecordSalePaymentDto {
  /** Método de pago único (para retrocompatibilidad). */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Matches(/\S/u)
  paymentMethodText?: string;

  /** Líneas de pago dividido (para pagos mixtos: efectivo + tarjeta, etc.). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SplitPaymentLineDto)
  splitPayments?: SplitPaymentLineDto[];
}
