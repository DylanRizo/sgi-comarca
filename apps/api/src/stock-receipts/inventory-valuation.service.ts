import type {
  PaginatedData,
  PendingValuation,
  ValuationInput,
} from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';
import {
  authorizeStock,
  decimalInput,
  stockCommand,
  StockOperationError,
} from '../inventory/stock-command.js';

export class InventoryValuationService {
  constructor(private readonly client: DatabaseClient) {}

  /**
   * Every product/warehouse valuation, so an already-valued pair can be
   * corrected. `pending` answers "what is missing"; this answers "where is the
   * one I want to change", which the interface had no way to reach.
   */
  async search(
    actor: string,
    search: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedData<PendingValuation>> {
    await authorizeStock(
      this.client,
      actor,
      'finances.read',
      'inventory.valuation.manage',
    );
    const term = search.trim();
    return this.list(
      {
        product: {
          active: true,
          ...(term
            ? {
                OR: [
                  { code: { contains: term, mode: 'insensitive' as const } },
                  { name: { contains: term, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
      },
      page,
      pageSize,
    );
  }

  async pending(
    actor: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedData<PendingValuation>> {
    await authorizeStock(
      this.client,
      actor,
      'finances.read',
      'inventory.valuation.manage',
    );
    const where = {
      product: { active: true },
      OR: [
        { currentUnitCost: null },
        { currentUnitPrice: null },
        { costReviewRequired: true },
        { priceReviewRequired: true },
      ],
    };
    return this.list(where, page, pageSize);
  }

  private async list(
    where: Record<string, unknown>,
    page: number,
    pageSize: number,
  ): Promise<PaginatedData<PendingValuation>> {
    const [totalItems, rows] = await Promise.all([
      this.client.inventoryBalance.count({ where }),
      this.client.inventoryBalance.findMany({
        where,
        include: {
          product: { select: { id: true, code: true, name: true } },
          warehouse: true,
        },
        orderBy: [{ productId: 'asc' }, { warehouseId: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        product: row.product,
        warehouse: {
          id: row.warehouse.id,
          code: row.warehouse.code,
          name: row.warehouse.name,
          active: row.warehouse.active,
        },
        quantity: row.quantity.toString(),
        unitCost: row.currentUnitCost?.toFixed(2) ?? null,
        unitPrice: row.currentUnitPrice?.toFixed(2) ?? null,
        version: row.version,
      })),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      },
    };
  }

  async update(
    actor: string,
    id: string,
    key: string | undefined,
    input: ValuationInput,
  ) {
    return stockCommand(
      this.client,
      actor,
      'valuation.update',
      key,
      { id, ...input },
      ['inventory.valuation.manage', 'finances.read'],
      async (transaction) => {
        const reason = input.reason?.trim();
        if (
          !reason ||
          reason.length > 500 ||
          (input.unitCost === undefined && input.unitPrice === undefined)
        )
          throw new StockOperationError('STOCK_REQUEST_INVALID');
        await transaction.$queryRaw`SELECT id FROM inventory_balances WHERE id = ${id}::uuid FOR UPDATE`;
        const before = await transaction.inventoryBalance.findUnique({
          where: { id },
        });
        if (!before) throw new StockOperationError('STOCK_RESOURCE_NOT_FOUND');
        if (before.version !== input.expectedVersion)
          throw new StockOperationError('STOCK_OPERATION_CONFLICT');
        const cost =
          input.unitCost === undefined
            ? before.currentUnitCost
            : decimalInput(input.unitCost, true);
        const price =
          input.unitPrice === undefined
            ? before.currentUnitPrice
            : decimalInput(input.unitPrice, true, true);
        const occurredAt = new Date();
        const evidence = await transaction.productWarehouseValuation.create({
          data: {
            productId: before.productId,
            warehouseId: before.warehouseId,
            unitCost: cost,
            unitPrice: price,
            observedAt: occurredAt,
            requiresHumanReview: cost === null || cost.isZero(),
            reviewReason:
              cost === null || cost.isZero()
                ? 'Costo pendiente de revisión'
                : null,
          },
        });
        await transaction.inventoryBalance.update({
          where: { id },
          data: {
            currentUnitCost: cost,
            currentUnitPrice: price,
            costReviewRequired:
              input.unitCost === undefined
                ? before.costReviewRequired
                : cost === null || cost.isZero(),
            priceReviewRequired:
              input.unitPrice === undefined
                ? before.priceReviewRequired
                : price === null,
            version: { increment: 1 },
          },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor,
            action: 'inventory.valuation.completed',
            entityType: 'ProductWarehouseValuation',
            entityId: evidence.id,
            beforeData: {
              cost: before.currentUnitCost?.toString() ?? null,
              price: before.currentUnitPrice?.toString() ?? null,
            },
            afterData: {
              cost: cost?.toString() ?? null,
              price: price?.toString() ?? null,
            },
            metadata: { balanceId: id, reason },
            occurredAt,
          },
        });
        return { id: evidence.id, balanceId: id, version: before.version + 1 };
      },
    );
  }
}
