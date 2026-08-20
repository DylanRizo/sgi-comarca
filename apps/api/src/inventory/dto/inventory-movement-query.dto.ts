import { ValidationPipe } from '@nestjs/common';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { InventoryMovementType } from '@sgi/contracts';

import { PaginationQueryDto } from '../../common/dto/read-query.dto.js';

const supportedMovementTypes = [
  'INITIAL_BALANCE',
  'LEGACY',
  'RECEIPT',
  'ADJUSTMENT',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'SALE',
  'SALE_CANCELLATION',
] as const satisfies readonly InventoryMovementType[];

export class InventoryMovementQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsIn(supportedMovementTypes)
  movementType?: InventoryMovementType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sourceType?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

export class InventoryMovementIdParamDto {
  @IsUUID()
  id!: string;
}

export const inventoryMovementQueryPipe = new ValidationPipe({
  expectedType: InventoryMovementQueryDto,
  forbidNonWhitelisted: true,
  transform: true,
  whitelist: true,
});
