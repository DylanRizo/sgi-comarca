import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type {
  ApiSuccess,
  PaginatedData,
  ProductInventoryView,
} from '@sgi/contracts';
import type { Request, Response } from 'express';

import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  InventoryListQueryDto,
  ProductInventoryQueryDto,
} from '../common/dto/read-query.dto.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  ProductIdParamDto,
  WarehouseIdParamDto,
} from '../common/dto/resource-id-param.dto.js';
import { mapReadModelError, readSuccess } from '../common/read-http.js';
import { InventoryReadService } from './inventory-read.service.js';

@Controller({ path: 'inventory', version: '1' })
@RequirePermission('inventory.read')
export class InventoryController {
  constructor(
    @Inject(InventoryReadService)
    private readonly inventory: InventoryReadService,
  ) {}

  @Get()
  async list(
    @Query() query: InventoryListQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<PaginatedData<ProductInventoryView>>> {
    return readSuccess(await this.inventory.list(query), request, response);
  }

  @Get('products/:productId')
  async product(
    @Param() params: ProductIdParamDto,
    @Query() query: ProductInventoryQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<ProductInventoryView>> {
    try {
      return readSuccess(
        await this.inventory.getProduct(params.productId, query),
        request,
        response,
      );
    } catch (error) {
      mapReadModelError(error);
    }
  }

  @Get('warehouses/:warehouseId')
  async warehouse(
    @Param() params: WarehouseIdParamDto,
    @Query() query: InventoryListQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<PaginatedData<ProductInventoryView>>> {
    try {
      return readSuccess(
        await this.inventory.listByWarehouse(params.warehouseId, query),
        request,
        response,
      );
    } catch (error) {
      mapReadModelError(error);
    }
  }
}
