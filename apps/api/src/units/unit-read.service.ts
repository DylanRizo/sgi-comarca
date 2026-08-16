import type { PaginatedData, UnitSummary } from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';

import type { CatalogListQueryDto } from '../common/dto/read-query.dto.js';
import { pageOffset, pageResult } from '../common/pagination.js';
import { ReadModelNotFoundError } from '../common/read-http.js';

export class UnitReadService {
  constructor(private readonly database: DatabaseClient) {}

  async list(input: CatalogListQueryDto): Promise<PaginatedData<UnitSummary>> {
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
    const totalItems = await this.database.unit.count({ where });
    const units = await this.database.unit.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: pageOffset(input),
      take: input.pageSize,
      where,
    });
    return pageResult(units.map(UnitReadService.map), totalItems, input);
  }

  async get(id: string): Promise<UnitSummary> {
    const unit = await this.database.unit.findUnique({ where: { id } });
    if (!unit) throw new ReadModelNotFoundError('unit');
    return UnitReadService.map(unit);
  }

  private static map(unit: UnitSummary): UnitSummary {
    return {
      active: unit.active,
      code: unit.code,
      id: unit.id,
      name: unit.name,
    };
  }
}
