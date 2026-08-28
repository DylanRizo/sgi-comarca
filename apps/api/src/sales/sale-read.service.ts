import type { PaginatedData, SaleView } from '@sgi/contracts';
import type { DatabaseClient, Prisma } from '@sgi/database';

import { pageOffset, pageResult } from '../common/pagination.js';
import type { SaleQueryDto } from './dto/sale-query.dto.js';
import { mapSale } from './sale-read.mapper.js';

export class SaleNotFoundError extends Error {
  constructor() {
    super('Sale was not found.');
    this.name = 'SaleNotFoundError';
  }
}

/**
 * Only read-safe columns are selected. `unitCostSnapshot`, idempotency and
 * request hashes, delivery place, and legacy free text are never selected, so
 * they cannot leak through the read surface (ADR-009, plan §3).
 */
const saleSelect = {
  businessDate: true,
  completedAt: true,
  createdAt: true,
  currencyCode: true,
  departureAt: true,
  id: true,
  items: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      lineSubtotal: true,
      product: { select: { code: true, id: true, name: true } },
      quantity: true,
      shippingAllocation: true,
      unitPriceSnapshot: true,
      warehouse: {
        select: { active: true, code: true, id: true, name: true },
      },
    },
  },
  origin: true,
  paymentStatus: true,
  saleNumber: true,
  sellerUserId: true,
  shippingAmount: true,
  status: true,
  subtotal: true,
  total: true,
} satisfies Prisma.SaleSelect;

export class SaleReadService {
  constructor(private readonly database: DatabaseClient) {}

  async list(input: SaleQueryDto): Promise<PaginatedData<SaleView>> {
    const where = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.paymentStatus ? { paymentStatus: input.paymentStatus } : {}),
      ...(input.sellerUserId ? { sellerUserId: input.sellerUserId } : {}),
      ...(input.warehouseId
        ? { items: { some: { warehouseId: input.warehouseId } } }
        : {}),
      ...(input.from || input.to
        ? {
            businessDate: {
              ...(input.from ? { gte: new Date(input.from) } : {}),
              ...(input.to ? { lte: new Date(input.to) } : {}),
            },
          }
        : {}),
    };
    const [totalItems, sales] = await Promise.all([
      this.database.sale.count({ where }),
      this.database.sale.findMany({
        orderBy: [{ businessDate: 'desc' }, { id: 'desc' }],
        select: saleSelect,
        skip: pageOffset(input),
        take: input.pageSize,
        where,
      }),
    ]);
    return pageResult(sales.map(mapSale), totalItems, input);
  }

  async get(id: string): Promise<SaleView> {
    const sale = await this.database.sale.findUnique({
      select: saleSelect,
      where: { id },
    });
    if (!sale) throw new SaleNotFoundError();
    return mapSale(sale);
  }
}
