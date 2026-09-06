import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ReceiptFieldsDto {
  @IsUUID() warehouseId!: string;
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/u)
  quantity!: string;
  @IsString() @MaxLength(500) @Matches(/\S/u) reason!: string;
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/u)
  unitCost?: string;
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/u)
  unitPrice?: string;
}
export class ReceiptDto extends ReceiptFieldsDto {
  @IsUUID() productId!: string;
}
export class ProductFieldsDto {
  @IsString() @MaxLength(64) @Matches(/\S/u) code!: string;
  @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @IsUUID() unitId!: string;
  @IsUUID() groupId!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/u)
  minimumStock!: string;
}
export class CreateProductDto extends ProductFieldsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ReceiptFieldsDto)
  initialReceipt?: ReceiptFieldsDto;
}
export class EditProductDto extends ProductFieldsDto {
  @IsISO8601({ strict: true }) expectedUpdatedAt!: string;
}
export class ValuationDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/u)
  unitCost?: string;
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/u)
  unitPrice?: string;
  @IsString() @MaxLength(500) @Matches(/\S/u) reason!: string;
}
export class GroupDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
}
