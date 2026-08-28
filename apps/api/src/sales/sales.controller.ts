import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { ApiSuccess, PaginatedData, SaleView } from '@sgi/contracts';
import type { Request, Response } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/http/auth-http-context.js';
import { readSuccess } from '../common/read-http.js';
import { CreateSaleService } from './create-sale.service.js';
// DTO values must remain runtime imports so Nest emits validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateSaleDto } from './dto/create-sale.dto.js';
// DTO values must remain runtime imports so Nest emits validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  SaleIdParamDto,
  SaleQueryDto,
  saleQueryPipe,
} from './dto/sale-query.dto.js';
import { SaleNotFoundError, SaleReadService } from './sale-read.service.js';
import { mapSaleError } from './sales-http.exception.js';

@Controller({ path: 'sales', version: '1' })
@RequirePermission('sales.read')
export class SalesController {
  constructor(
    @Inject(SaleReadService) private readonly sales: SaleReadService,
    @Inject(CreateSaleService)
    private readonly creation: CreateSaleService,
  ) {}

  @Post()
  @RequirePermission('sales.create')
  async create(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: CreateSaleDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<SaleView>> {
    try {
      return readSuccess(
        await this.creation.create(current.userId, idempotencyKey, input),
        request,
        response,
      );
    } catch (error) {
      mapSaleError(error);
    }
  }

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
