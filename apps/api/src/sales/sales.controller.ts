import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { ApiSuccess, PaginatedData, SaleView } from '@sgi/contracts';
import type { Request, Response } from 'express';

import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { readSuccess } from '../common/read-http.js';
// DTO values must remain runtime imports so Nest emits validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  SaleIdParamDto,
  SaleQueryDto,
  saleQueryPipe,
} from './dto/sale-query.dto.js';
import { SaleNotFoundError, SaleReadService } from './sale-read.service.js';

@Controller({ path: 'sales', version: '1' })
@RequirePermission('sales.read')
export class SalesController {
  constructor(
    @Inject(SaleReadService) private readonly sales: SaleReadService,
  ) {}

  @Get()
  async list(
    @Query(saleQueryPipe) query: SaleQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<PaginatedData<SaleView>>> {
    return readSuccess(await this.sales.list(query), request, response);
  }

  @Get(':id')
  async detail(
    @Param() params: SaleIdParamDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<SaleView>> {
    try {
      return readSuccess(await this.sales.get(params.id), request, response);
    } catch (error) {
      if (error instanceof SaleNotFoundError) {
        throw new NotFoundException('Sale was not found.');
      }
      throw error;
    }
  }
}
