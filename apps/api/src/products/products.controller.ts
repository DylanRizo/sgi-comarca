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
  ProductDetail,
  ProductSummary,
} from '@sgi/contracts';
import type { Request, Response } from 'express';

import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
// DTO values must remain runtime imports so Nest emits validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CatalogListQueryDto } from '../common/dto/read-query.dto.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ResourceIdParamDto } from '../common/dto/resource-id-param.dto.js';
import { mapReadModelError, readSuccess } from '../common/read-http.js';
import { ProductReadService } from './product-read.service.js';

@Controller({ path: 'products', version: '1' })
@RequirePermission('inventory.read')
export class ProductsController {
  constructor(
    @Inject(ProductReadService)
    private readonly products: ProductReadService,
  ) {}

  @Get()
  async list(
    @Query() query: CatalogListQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<PaginatedData<ProductSummary>>> {
    return readSuccess(await this.products.list(query), request, response);
  }

  @Get(':id')
  async detail(
    @Param() params: ResourceIdParamDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<ProductDetail>> {
    try {
      return readSuccess(await this.products.get(params.id), request, response);
    } catch (error) {
      mapReadModelError(error);
    }
  }
}
