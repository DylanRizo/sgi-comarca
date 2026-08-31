import { ValidationPipe } from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/read-query.dto.js';

const nonNegativeQuantity = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/u;
const isoBusinessDate = /^\d{4}-\d{2}-\d{2}$/u;

export class CreateInventoryCountSessionDto {
  @IsString()
  @Matches(isoBusinessDate)
  businessDate!: string;

  @IsString()
  @MaxLength(500)
  @Matches(/\S/u)
  reason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  warehouseIds!: string[];
}

export class CaptureInventoryCountLineDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsString()
  @Matches(nonNegativeQuantity)
  countedQuantity!: string;
}

export class CancelInventoryCountSessionDto {
  @IsString()
  @MaxLength(500)
  @Matches(/\S/u)
  reason!: string;
}

export class InventoryCountSessionIdParamDto {
  @IsUUID()
  id!: string;
}

export class InventoryCountQueryDto extends PaginationQueryDto {}

export const inventoryCountQueryPipe = new ValidationPipe({
  expectedType: InventoryCountQueryDto,
  forbidNonWhitelisted: true,
  transform: true,
  whitelist: true,
});
