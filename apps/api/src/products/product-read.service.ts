import type {
  PaginatedData,
  ProductDetail,
  ProductSummary,
} from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';

import type { CatalogListQueryDto } from '../common/dto/read-query.dto.js';
import { pageOffset, pageResult } from '../common/pagination.js';
import { ReadModelNotFoundError } from '../common/read-http.js';

export class ProductReadService {
  constructor(private readonly database: DatabaseClient) {}

  async list(
    input: CatalogListQueryDto,
  ): Promise<PaginatedData<ProductSummary>> {
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
    const totalItems = await this.database.product.count({ where });
    const products = await this.database.product.findMany({
      include: { unit: true },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      skip: pageOffset(input),
      take: input.pageSize,
      where,
    });

    return pageResult(
      products.map((product) => ({
        active: product.active,
        code: product.code,
        id: product.id,
        minimumStock: product.minimumStock.toString(),
        name: product.name,
        unit: product.unit
          ? {
              active: product.unit.active,
              code: product.unit.code,
              id: product.unit.id,
              name: product.unit.name,
            }
          : null,
      })),
      totalItems,
      input,
    );
  }

  async get(id: string): Promise<ProductDetail> {
    const product = await this.database.product.findUnique({
      include: { unit: true },
      where: { id },
    });
    if (!product) throw new ReadModelNotFoundError('product');

    return {
      active: product.active,
      code: product.code,
      createdAt: product.createdAt.toISOString(),
      description: product.description,
      id: product.id,
      minimumStock: product.minimumStock.toString(),
      name: product.name,
      unit: product.unit
        ? {
            active: product.unit.active,
            code: product.unit.code,
            id: product.unit.id,
            name: product.unit.name,
          }
        : null,
      updatedAt: product.updatedAt.toISOString(),
    };
  }
}
