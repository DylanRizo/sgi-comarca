import type { PaginatedData, SaleView } from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';

import { pageOffset, pageResult } from '../common/pagination.js';
import type { SaleQueryDto } from './dto/sale-query.dto.js';
import { mapSale } from './sale-read.mapper.js';
import { saleSelect } from './sale-select.js';

export class SaleNotFoundError extends Error {
  constructor() {
    super('Sale was not found.');
    this.name = 'SaleNotFoundError';
  }
}

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
