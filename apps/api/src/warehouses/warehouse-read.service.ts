import type { PaginatedData, WarehouseSummary } from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';

import type { CatalogListQueryDto } from '../common/dto/read-query.dto.js';
import { pageOffset, pageResult } from '../common/pagination.js';
import { ReadModelNotFoundError } from '../common/read-http.js';

export class WarehouseReadService {
  constructor(private readonly database: DatabaseClient) {}

  async list(
    input: CatalogListQueryDto,
  ): Promise<PaginatedData<WarehouseSummary>> {
    const search = input.search?.trim();
    const where = {
      ...(input.active === undefined ? {} : { active: input.active }),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' as const } },
              { name: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const totalItems = await this.database.warehouse.count({ where });
    const warehouses = await this.database.warehouse.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: pageOffset(input),
      take: input.pageSize,
      where,
    });
    return pageResult(
      warehouses.map(WarehouseReadService.map),
      totalItems,
      input,
    );
  }

  async get(id: string): Promise<WarehouseSummary> {
    const warehouse = await this.database.warehouse.findUnique({
      where: { id },
    });
    if (!warehouse) throw new ReadModelNotFoundError('warehouse');
    return WarehouseReadService.map(warehouse);
  }

  private static map(warehouse: WarehouseSummary): WarehouseSummary {
    return {
      active: warehouse.active,
      code: warehouse.code,
      id: warehouse.id,
      name: warehouse.name,
    };
  }
}
