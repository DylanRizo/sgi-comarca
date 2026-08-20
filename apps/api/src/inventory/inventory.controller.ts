import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type {
  ApiSuccess,
  InventoryAdjustmentResult,
  PaginatedData,
  ProductInventoryView,
} from '@sgi/contracts';
import type { Request, Response } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/http/auth-http-context.js';
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
import {
  inventoryListQueryPipe,
  productInventoryQueryPipe,
} from '../common/read-query.pipe.js';
import {
  InventoryAdjustmentError,
  InventoryAdjustmentService,
} from './inventory-adjustment.service.js';
// DTO values must remain runtime imports so Nest emits validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { InventoryAdjustmentDto } from './dto/inventory-adjustment.dto.js';
import { InventoryHttpException } from './inventory-http.exception.js';
import { InventoryReadService } from './inventory-read.service.js';

export function mapInventoryAdjustmentError(error: unknown): never {
  if (error instanceof InventoryAdjustmentError) {
    switch (error.code) {
      case 'INVENTORY_ADJUSTMENT_CONFLICT':
        throw InventoryHttpException.adjustmentConflict();
      case 'INVENTORY_ADJUSTMENT_INVALID':
        throw InventoryHttpException.adjustmentInvalid();
      case 'INVENTORY_BALANCE_NOT_FOUND':
        throw InventoryHttpException.balanceNotFound();
      case 'INVENTORY_NEGATIVE_BALANCE':
        throw InventoryHttpException.negativeBalance();
      case 'INVENTORY_PERMISSION_DENIED':
        throw new ForbiddenException('Permission denied.');
      case 'INVENTORY_PRODUCT_NOT_FOUND':
        throw InventoryHttpException.productNotFound();
      case 'INVENTORY_WAREHOUSE_NOT_FOUND':
        throw InventoryHttpException.warehouseNotFound();
    }
  }
  throw error;
}

@Controller({ path: 'inventory', version: '1' })
@RequirePermission('inventory.read')
export class InventoryController {
  constructor(
    @Inject(InventoryReadService)
    private readonly inventory: InventoryReadService,
    @Inject(InventoryAdjustmentService)
    private readonly adjustments: InventoryAdjustmentService,
  ) {}

  @Post('adjustments')
  @RequirePermission('inventory.adjust')
  async adjust(
    @Body() input: InventoryAdjustmentDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<InventoryAdjustmentResult>> {
    try {
      return readSuccess(
        await this.adjustments.adjust(current.userId, input),
        request,
        response,
      );
    } catch (error) {
      mapInventoryAdjustmentError(error);
    }
  }

  @Get()
  async list(
    @Query(inventoryListQueryPipe) query: InventoryListQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<PaginatedData<ProductInventoryView>>> {
    return readSuccess(await this.inventory.list(query), request, response);
  }

  @Get('products/:productId')
  async product(
    @Param() params: ProductIdParamDto,
    @Query(productInventoryQueryPipe) query: ProductInventoryQueryDto,
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
    @Query(inventoryListQueryPipe) query: InventoryListQueryDto,
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
