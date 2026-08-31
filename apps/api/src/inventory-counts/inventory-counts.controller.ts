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
  InventoryCountSessionSummary,
  InventoryCountSessionView,
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
  CancelInventoryCountSessionDto,
  CaptureInventoryCountLineDto,
  CreateInventoryCountSessionDto,
  InventoryCountQueryDto,
  inventoryCountQueryPipe,
  InventoryCountSessionIdParamDto,
} from './dto/inventory-count.dto.js';
import { mapInventoryCountError } from './inventory-count-http.exception.js';
import { InventoryCountLifecycleService } from './inventory-count-lifecycle.service.js';
import { InventoryCountSessionService } from './inventory-count-session.service.js';

/**
 * Physical inventory counts (FASE 9B.1).
 *
 * FASE 9A defined no read permission for counts, so reads accept either the
 * capture or the approval capability: a pure approver must be able to review
 * what it is approving, and a counter must see its own session. Cancelling
 * accepts either for the same reason — it is both "abandon my count" and "an
 * approver rejects this count", and the schema has no REJECTED state.
 */
@Controller({ path: 'inventory/counts', version: '1' })
@RequirePermission('inventory.audit.create', 'inventory.audit.approve')
export class InventoryCountsController {
  constructor(
    @Inject(InventoryCountSessionService)
    private readonly sessions: InventoryCountSessionService,
    @Inject(InventoryCountLifecycleService)
    private readonly lifecycle: InventoryCountLifecycleService,
  ) {}

  @Post()
  @RequirePermission('inventory.audit.create')
  async create(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: CreateInventoryCountSessionDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<InventoryCountSessionView>> {
    try {
      return readSuccess(
        await this.sessions.create(current.userId, idempotencyKey, input),
        request,
        response,
      );
    } catch (error) {
      mapInventoryCountError(error);
    }
  }

  @Post(':id/lines')
  @RequirePermission('inventory.audit.create')
  async captureLine(
    @Param() params: InventoryCountSessionIdParamDto,
    @Body() input: CaptureInventoryCountLineDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<InventoryCountSessionView>> {
    try {
      return readSuccess(
        await this.sessions.captureLine(current.userId, params.id, input),
        request,
        response,
      );
    } catch (error) {
      mapInventoryCountError(error);
    }
  }

  @Post(':id/submit')
  @RequirePermission('inventory.audit.create')
  async submit(
    @Param() params: InventoryCountSessionIdParamDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<InventoryCountSessionView>> {
    try {
      return readSuccess(
        await this.lifecycle.submit(current.userId, params.id),
        request,
        response,
      );
    } catch (error) {
      mapInventoryCountError(error);
    }
  }

  @Post(':id/approve')
  @RequirePermission('inventory.audit.approve')
  async approve(
    @Param() params: InventoryCountSessionIdParamDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<InventoryCountSessionView>> {
    try {
      return readSuccess(
        await this.lifecycle.approve(current.userId, params.id),
        request,
        response,
      );
    } catch (error) {
      mapInventoryCountError(error);
    }
  }

  /**
   * The guard admits either capability; the service decides which applies:
   * capture may abandon any non-terminal session, approval may stop a submitted
   * one.
   */
  @Post(':id/cancel')
  async cancel(
    @Param() params: InventoryCountSessionIdParamDto,
    @Body() input: CancelInventoryCountSessionDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<InventoryCountSessionView>> {
    try {
      return readSuccess(
        await this.lifecycle.cancel(current.userId, params.id, input.reason),
        request,
        response,
      );
    } catch (error) {
      mapInventoryCountError(error);
    }
  }

  @Get()
  async list(
    @Query(inventoryCountQueryPipe) query: InventoryCountQueryDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<PaginatedData<InventoryCountSessionSummary>>> {
    try {
      return readSuccess(
        await this.sessions.list(current.userId, query),
        request,
        response,
      );
    } catch (error) {
      mapInventoryCountError(error);
    }
  }

  @Get(':id')
  async detail(
    @Param() params: InventoryCountSessionIdParamDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<InventoryCountSessionView>> {
    try {
      return readSuccess(
        await this.sessions.get(current.userId, params.id),
        request,
        response,
      );
    } catch (error) {
      mapInventoryCountError(error);
    }
  }
}
