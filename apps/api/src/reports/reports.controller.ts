import {
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
  FinanceReportRow,
  InventoryReportRow,
  MovementReportRow,
  PaginatedData,
  SalesReportRow,
} from '@sgi/contracts';
import type { Request, Response } from 'express';

import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/http/auth-http-context.js';
import { readSuccess } from '../common/read-http.js';
// DTO values must remain runtime imports so Nest emits validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  FinanceReportQueryDto,
  financeReportQueryPipe,
  InventoryReportQueryDto,
  inventoryReportQueryPipe,
  MovementReportQueryDto,
  movementReportQueryPipe,
  SalesReportQueryDto,
  salesReportQueryPipe,
} from './dto/report-query.dto.js';
import { csvDocument, csvFilename } from './report-csv.js';
import { ReportReadService } from './report-read.service.js';

/**
 * FASE 9B.2 reports. Every route is a pure read guarded by `reports.read`.
 *
 * Two rules are enforced here rather than left to the reader. Reporting never
 * widens access to a domain: each route also requires that domain's own read
 * permission, so `reports.read` on its own discloses nothing. And monetary
 * columns additionally require `finances.read`, keeping the FASE 9 separation
 * of financial reading intact (plan §2).
 */
@Controller({ path: 'reports', version: '1' })
@RequirePermission('reports.read')
export class ReportsController {
  constructor(
    @Inject(ReportReadService) private readonly reports: ReportReadService,
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}

  @Get('inventory')
  async inventory(
    @Query(inventoryReportQueryPipe) query: InventoryReportQueryDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<PaginatedData<InventoryReportRow>> | undefined> {
    await this.require(current, 'inventory.read');
    const includeMoney = await this.permissions.hasPermission(
      current.userId,
      'finances.read',
    );
    const page = await this.reports.inventory(query, includeMoney);
    return this.emit(
      'inventario',
      [
        'productCode',
        'productName',
        'warehouseCode',
        'warehouseName',
        'quantity',
        'unitCost',
        'stockValue',
      ],
      page,
      (row) => [
        row.productCode,
        row.productName,
        row.warehouseCode,
        row.warehouseName,
        row.quantity,
        row.unitCost,
        row.stockValue,
      ],
      query.format,
      request,
      response,
    );
  }

  @Get('movements')
  async movements(
    @Query(movementReportQueryPipe) query: MovementReportQueryDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<PaginatedData<MovementReportRow>> | undefined> {
    await this.require(current, 'inventory.read');
    const page = await this.reports.movements(query);
    return this.emit(
      'movimientos',
      [
        'occurredAt',
        'type',
        'productCode',
        'productName',
        'warehouseCode',
        'warehouseName',
        'quantityDelta',
        'balanceAfter',
        'sourceType',
      ],
      page,
      (row) => [
        row.occurredAt,
        row.type,
        row.productCode,
        row.productName,
        row.warehouseCode,
        row.warehouseName,
        row.quantityDelta,
        row.balanceAfter,
        row.sourceType,
      ],
      query.format,
      request,
      response,
    );
  }

  @Get('sales')
  async sales(
    @Query(salesReportQueryPipe) query: SalesReportQueryDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<PaginatedData<SalesReportRow>> | undefined> {
    await this.require(current, 'sales.read');
    const page = await this.reports.sales(query);
    return this.emit(
      'ventas',
      [
        'saleNumber',
        'businessDate',
        'status',
        'paymentStatus',
        'itemCount',
        'subtotal',
        'shippingAmount',
        'total',
        'currencyCode',
      ],
      page,
      (row) => [
        row.saleNumber,
        row.businessDate,
        row.status,
        row.paymentStatus,
        row.itemCount,
        row.subtotal,
        row.shippingAmount,
        row.total,
        row.currencyCode,
      ],
      query.format,
      request,
      response,
    );
  }

  @Get('finances')
  async finances(
    @Query(financeReportQueryPipe) query: FinanceReportQueryDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<PaginatedData<FinanceReportRow>> | undefined> {
    await this.require(current, 'finances.read');
    const page = await this.reports.finances(query);
    return this.emit(
      'finanzas',
      [
        'businessDate',
        'entryType',
        'categoryCode',
        'categoryName',
        'amount',
        'currencyCode',
        'origin',
        'description',
      ],
      page,
      (row) => [
        row.businessDate,
        row.entryType,
        row.categoryCode,
        row.categoryName,
        row.amount,
        row.currencyCode,
        row.origin,
        row.description,
      ],
      query.format,
      request,
      response,
    );
  }

  /**
   * Reporting is a capability, not an access grant: it never lets an actor
   * read a domain they could not already read directly.
   */
  private async require(
    current: AuthenticatedRequestContext,
    code: string,
  ): Promise<void> {
    if (!(await this.permissions.hasPermission(current.userId, code))) {
      throw new ForbiddenException('Permission denied.');
    }
  }

  private emit<T>(
    name: string,
    headers: readonly string[],
    page: PaginatedData<T>,
    toRow: (row: T) => readonly unknown[],
    format: 'csv' | 'json' | undefined,
    request: Request,
    response: Response,
  ): ApiSuccess<PaginatedData<T>> | undefined {
    if (format !== 'csv') return readSuccess(page, request, response);

    // The export carries exactly the requested page, so a report can never
    // become an unbounded scan of the ledger.
    const document = csvDocument(headers, page.items.map(toRow));
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvFilename(name, new Date())}"`,
    );
    response.send(document);
    return undefined;
  }
}
