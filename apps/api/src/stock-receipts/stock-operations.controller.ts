import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/http/auth-http-context.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ResourceIdParamDto } from '../common/dto/resource-id-param.dto.js';
import {
  CatalogListQueryDto,
  PaginationQueryDto,
} from '../common/dto/read-query.dto.js';
import { readSuccess } from '../common/read-http.js';
import { ProductWriteService } from '../products/product-write.service.js';
import { ProductCatalogService } from '../products/product-catalog.service.js';
import { StockReceiptService } from './stock-receipt.service.js';
import { InventoryValuationService } from './inventory-valuation.service.js';
import { mapStockOperationError } from './stock-operation-http.exception.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  CreateProductDto,
  EditProductDto,
  GroupDto,
  ReceiptDto,
  ValuationDto,
} from './stock-operations.dto.js';

const paginationPipe = new ValidationPipe({
  expectedType: PaginationQueryDto,
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

/** The valuation search adds `search` on top of the pagination query. */
const catalogPipe = new ValidationPipe({
  expectedType: CatalogListQueryDto,
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller({ path: 'products', version: '1' })
@RequirePermission('products.manage')
export class ProductCommandsController {
  constructor(
    @Inject(StockReceiptService) private readonly receipts: StockReceiptService,
    @Inject(ProductWriteService) private readonly products: ProductWriteService,
  ) {}
  @Post()
  async create(
    @CurrentUser() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateProductDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return readSuccess(
        await this.receipts.createProduct(actor.userId, key, input),
        request,
        response,
      );
    } catch (error) {
      mapStockOperationError(error);
    }
  }
  @Patch(':id')
  async edit(
    @CurrentUser() actor: AuthenticatedRequestContext,
    @Param() params: ResourceIdParamDto,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: EditProductDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return readSuccess(
        await this.products.edit(actor.userId, params.id, key, input),
        request,
        response,
      );
    } catch (error) {
      mapStockOperationError(error);
    }
  }
}

@Controller({ path: 'product-groups', version: '1' })
@RequirePermission('inventory.read')
export class ProductGroupsController {
  constructor(
    @Inject(ProductCatalogService)
    private readonly catalogs: ProductCatalogService,
  ) {}
  @Get()
  async list(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return readSuccess(await this.catalogs.groups(), request, response);
  }
  @Post()
  @RequirePermission('products.manage')
  async create(
    @CurrentUser() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: GroupDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return readSuccess(
        await this.catalogs.create(actor.userId, key, input.name),
        request,
        response,
      );
    } catch (error) {
      mapStockOperationError(error);
    }
  }
}

@Controller({ path: 'stock-receipts', version: '1' })
@RequirePermission('inventory.read')
export class StockReceiptsController {
  constructor(
    @Inject(StockReceiptService) private readonly receipts: StockReceiptService,
  ) {}
  @Post()
  @RequirePermission('stock-receipts.create')
  async create(
    @CurrentUser() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: ReceiptDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return readSuccess(
        await this.receipts.create(actor.userId, key, input),
        request,
        response,
      );
    } catch (error) {
      mapStockOperationError(error);
    }
  }
  @Get()
  async list(
    @CurrentUser() actor: AuthenticatedRequestContext,
    @Query(paginationPipe) query: PaginationQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return readSuccess(
        await this.receipts.list(actor.userId, query.page, query.pageSize),
        request,
        response,
      );
    } catch (error) {
      mapStockOperationError(error);
    }
  }
  @Get(':id')
  async get(
    @CurrentUser() actor: AuthenticatedRequestContext,
    @Param() params: ResourceIdParamDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return readSuccess(
        await this.receipts.get(actor.userId, params.id),
        request,
        response,
      );
    } catch (error) {
      mapStockOperationError(error);
    }
  }
}

@Controller({ path: 'inventory/valuations', version: '1' })
@RequirePermission('inventory.valuation.manage')
export class InventoryValuationsController {
  constructor(
    @Inject(InventoryValuationService)
    private readonly valuations: InventoryValuationService,
  ) {}
  /** Any valuation, so an already-valued product/warehouse can be corrected. */
  @Get()
  async search(
    @CurrentUser() actor: AuthenticatedRequestContext,
    @Query(catalogPipe) query: CatalogListQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return readSuccess(
        await this.valuations.search(
          actor.userId,
          query.search ?? '',
          query.page,
          query.pageSize,
        ),
        request,
        response,
      );
    } catch (error) {
      mapStockOperationError(error);
    }
  }

  @Get('pending')
  async pending(
    @CurrentUser() actor: AuthenticatedRequestContext,
    @Query(paginationPipe) query: PaginationQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return readSuccess(
        await this.valuations.pending(actor.userId, query.page, query.pageSize),
        request,
        response,
      );
    } catch (error) {
      mapStockOperationError(error);
    }
  }
  @Post(':id')
  async update(
    @CurrentUser() actor: AuthenticatedRequestContext,
    @Param() params: ResourceIdParamDto,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: ValuationDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return readSuccess(
        await this.valuations.update(actor.userId, params.id, key, input),
        request,
        response,
      );
    } catch (error) {
      mapStockOperationError(error);
    }
  }
}
