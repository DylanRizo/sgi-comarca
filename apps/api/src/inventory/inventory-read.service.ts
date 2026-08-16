import type { PaginatedData, ProductInventoryView } from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';

import type {
  InventoryListQueryDto,
  ProductInventoryQueryDto,
} from '../common/dto/read-query.dto.js';
import { pageOffset, pageResult } from '../common/pagination.js';
import { ReadModelNotFoundError } from '../common/read-http.js';
import {
  mapProductInventory,
  type InventoryProductRecord,
} from './inventory-read.mapper.js';

export class InventoryReadService {
  constructor(private readonly database: DatabaseClient) {}

  async list(
    input: InventoryListQueryDto,
  ): Promise<PaginatedData<ProductInventoryView>> {
    const search = input.search?.trim();
    const balanceWhere = {
      ...(input.warehouseId ? { warehouseId: input.warehouseId } : {}),
      ...(input.availableOnly ? { quantity: { gt: 0 } } : {}),
    };
    const productWhere = {
      ...(input.active === undefined ? {} : { active: input.active }),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' as const } },
              { name: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      inventoryBalances: { some: balanceWhere },
    };
    const valuationWhere = input.warehouseId
      ? { warehouseId: input.warehouseId }
      : {};
    const totalItems = await this.database.product.count({
      where: productWhere,
    });
    const products = await this.database.product.findMany({
      include: {
        inventoryBalances: {
          include: { warehouse: true },
          orderBy: [{ warehouseId: 'asc' }, { id: 'asc' }],
          where: balanceWhere,
        },
        productWarehouseValuations: {
          orderBy: [
            { warehouseId: 'asc' },
            { observedAt: 'desc' },
            { id: 'asc' },
          ],
          where: valuationWhere,
        },
        unit: true,
      },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      skip: pageOffset(input),
      take: input.pageSize,
      where: productWhere,
    });

    return pageResult(
      products.map((product) =>
        mapProductInventory(product as InventoryProductRecord),
      ),
      totalItems,
      input,
    );
  }

  async listByWarehouse(
    warehouseId: string,
    input: InventoryListQueryDto,
  ): Promise<PaginatedData<ProductInventoryView>> {
    await this.ensureWarehouse(warehouseId);
    return this.list({ ...input, warehouseId });
  }

  async getProduct(
    productId: string,
    input: ProductInventoryQueryDto,
  ): Promise<ProductInventoryView> {
    if (input.warehouseId) await this.ensureWarehouse(input.warehouseId);
    const balanceWhere = input.warehouseId
      ? { warehouseId: input.warehouseId }
      : {};
    const product = await this.database.product.findUnique({
      include: {
        inventoryBalances: {
          include: { warehouse: true },
          orderBy: [{ warehouseId: 'asc' }, { id: 'asc' }],
          where: balanceWhere,
        },
        productWarehouseValuations: {
          orderBy: [
            { warehouseId: 'asc' },
            { observedAt: 'desc' },
            { id: 'asc' },
          ],
          where: balanceWhere,
        },
        unit: true,
      },
      where: { id: productId },
    });
    if (!product) throw new ReadModelNotFoundError('product');
    return mapProductInventory(product as InventoryProductRecord);
  }

  private async ensureWarehouse(id: string): Promise<void> {
    const exists = await this.database.warehouse.count({ where: { id } });
    if (exists === 0) throw new ReadModelNotFoundError('warehouse');
  }
}
