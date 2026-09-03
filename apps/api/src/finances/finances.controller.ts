import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type {
  ApiSuccess,
  DailyClosingPreviewView,
  DailyClosingView,
  FinanceLineView,
  FinanceTotalsView,
  FinancialCategoryView,
  PaginatedData,
} from '@sgi/contracts';
import type { Request, Response } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/http/auth-http-context.js';
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
// DTO values must remain runtime imports so Nest emits validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateFinancialEntryDto } from './dto/create-financial-entry.dto.js';
import { CreateFinancialEntryService } from './create-financial-entry.service.js';
import { ClosingPreviewService } from './closing-preview.service.js';
// DTO values must remain runtime imports so Nest emits validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  ClosingPreviewQueryDto,
  closingPreviewQueryPipe,
} from './dto/daily-closing.dto.js';
import { DailyClosingService } from './daily-closing.service.js';
// DTO values must remain runtime imports so Nest emits validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  CreateDailyClosingDto,
  ReopenDailyClosingDto,
} from './dto/daily-closing.dto.js';
import { FinanceReadService } from './finance-read.service.js';
import { mapFinanceError } from './finances-http.exception.js';

@Controller({ path: 'finances', version: '1' })
@RequirePermission('finances.read')
export class FinancesController {
  constructor(
    @Inject(FinanceReadService) private readonly finances: FinanceReadService,
    @Inject(CreateFinancialEntryService)
    private readonly entries: CreateFinancialEntryService,
  ) {}

  @Post()
  @RequirePermission('finances.manual.create')
  async create(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: CreateFinancialEntryDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<FinanceLineView>> {
    try {
      return readSuccess(
        await this.entries.create(current.userId, idempotencyKey, input),
        request,
        response,
      );
    } catch (error) {
      mapFinanceError(error);
    }
  }

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
    @Inject(DailyClosingService)
    private readonly closings: DailyClosingService,
    @Inject(ClosingPreviewService)
    private readonly preview: ClosingPreviewService,
  ) {}

  /**
   * The day's figures before committing to a closing. A pure read: it creates
   * nothing, so `closings.read` is the right gate rather than `closings.create`
   * — someone who may look at closings may look at what one would contain.
   */
  @Get('preview')
  @RequirePermission('closings.read')
  async previewClosing(
    @Query(closingPreviewQueryPipe) query: ClosingPreviewQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<DailyClosingPreviewView>> {
    return readSuccess(
      await this.preview.preview(query.businessDate),
      request,
      response,
    );
  }

  @Post()
  @RequirePermission('closings.create')
  async create(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: CreateDailyClosingDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<DailyClosingView>> {
    try {
      return readSuccess(
        await this.closings.create(current.userId, idempotencyKey, input),
        request,
        response,
      );
    } catch (error) {
      mapFinanceError(error);
    }
  }

  @Post(':id/reopen')
  @RequirePermission('closings.reopen')
  async reopen(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param() params: FinanceIdParamDto,
    @Body() input: ReopenDailyClosingDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<DailyClosingView>> {
    try {
      return readSuccess(
        await this.closings.reopen(
          current.userId,
          params.id,
          input.reason,
          idempotencyKey,
        ),
        request,
        response,
      );
    } catch (error) {
      mapFinanceError(error);
    }
  }

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
