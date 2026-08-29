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
  DailyClosingView,
  FinanceLineView,
  FinanceTotalsView,
  FinancialCategoryView,
  PaginatedData,
} from '@sgi/contracts';
import type { Request, Response } from 'express';

import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { readSuccess } from '../common/read-http.js';
// DTO values must remain runtime imports so Nest emits validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  DailyClosingQueryDto,
  dailyClosingQueryPipe,
  FinanceIdParamDto,
  FinanceLineQueryDto,
  financeLineQueryPipe,
} from './dto/finance-query.dto.js';
import { FinanceReadService } from './finance-read.service.js';
import { mapFinanceError } from './finances-http.exception.js';

@Controller({ path: 'finances', version: '1' })
@RequirePermission('finances.read')
export class FinancesController {
  constructor(
    @Inject(FinanceReadService) private readonly finances: FinanceReadService,
  ) {}

  @Get('categories')
  async categories(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<readonly FinancialCategoryView[]>> {
    return readSuccess(await this.finances.categories(), request, response);
  }

  @Get('totals')
  async totals(
    @Query(financeLineQueryPipe) query: FinanceLineQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<FinanceTotalsView>> {
    return readSuccess(await this.finances.totals(query), request, response);
  }

  @Get()
  async lines(
    @Query(financeLineQueryPipe) query: FinanceLineQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<PaginatedData<FinanceLineView>>> {
    return readSuccess(await this.finances.lines(query), request, response);
  }
}

@Controller({ path: 'closings', version: '1' })
@RequirePermission('closings.read')
export class DailyClosingsController {
  constructor(
    @Inject(FinanceReadService) private readonly finances: FinanceReadService,
  ) {}

  @Get()
  async list(
    @Query(dailyClosingQueryPipe) query: DailyClosingQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<PaginatedData<DailyClosingView>>> {
    return readSuccess(await this.finances.closings(query), request, response);
  }

  @Get(':id')
  async detail(
    @Param() params: FinanceIdParamDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<DailyClosingView>> {
    try {
      return readSuccess(
        await this.finances.closing(params.id),
        request,
        response,
      );
    } catch (error) {
      mapFinanceError(error);
    }
  }
}
