import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function parseBoolean(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class PaginationQueryDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize = 25;
}

export class CatalogListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value))
  active?: boolean;
}

export class InventoryListQueryDto extends CatalogListQueryDto {
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value))
  availableOnly?: boolean;
}

export class ProductInventoryQueryDto {
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}
