import { IsUUID } from 'class-validator';

export class ResourceIdParamDto {
  @IsUUID()
  id!: string;
}

export class ProductIdParamDto {
  @IsUUID()
  productId!: string;
}

export class WarehouseIdParamDto {
  @IsUUID()
  warehouseId!: string;
}
