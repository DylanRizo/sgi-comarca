import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type {
  ApiSuccess,
  InventoryAnalytics,
  SalesAnalytics,
} from '@sgi/contracts';
import type { Request, Response } from 'express';

import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/http/auth-http-context.js';
import { readSuccess } from '../common/read-http.js';
import {
  AnalyticsError,
  AnalyticsReadService,
} from './analytics-read.service.js';
// DTO values must remain runtime imports so Nest emits validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  SalesAnalyticsQueryDto,
  salesAnalyticsQueryPipe,
} from './dto/analytics-query.dto.js';

/**
 * FASE 9B.3 analytics. Every route is a pure read guarded by `analytics.read`.
 *
 * The same two rules the reports carry apply here. Analytics never widens
 * access to a domain, so each route also requires that domain's own read
 * permission. And every monetary figure — revenue, inventory value, profit,
 * margin — additionally requires `finances.read`, so only an actor who may
 * already read finances sees money (plan §2).
 */
@Controller({ path: 'analytics', version: '1' })
@RequirePermission('analytics.read')
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsReadService)
    private readonly analytics: AnalyticsReadService,
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}

  @Get('inventory')
  async inventory(
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<InventoryAnalytics>> {
    await this.require(current, 'inventory.read');
    const includeMoney = await this.money(current);
    return readSuccess(
      await this.analytics.inventory(includeMoney),
      request,
      response,
    );
  }

  @Get('sales')
  async sales(
    @Query(salesAnalyticsQueryPipe) query: SalesAnalyticsQueryDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<SalesAnalytics>> {
    await this.require(current, 'sales.read');
    const includeMoney = await this.money(current);
    try {
      return readSuccess(
        await this.analytics.sales(query, includeMoney),
        request,
        response,
      );
    } catch (error) {
      if (error instanceof AnalyticsError) {
        throw new BadRequestException(error.code);
      }
      throw error;
    }
  }

  private async money(current: AuthenticatedRequestContext): Promise<boolean> {
    return this.permissions.hasPermission(current.userId, 'finances.read');
  }

  private async require(
    current: AuthenticatedRequestContext,
    code: string,
  ): Promise<void> {
    if (!(await this.permissions.hasPermission(current.userId, code))) {
      throw new ForbiddenException('Permission denied.');
    }
  }
}
