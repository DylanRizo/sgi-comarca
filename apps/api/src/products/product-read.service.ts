import type {
  PaginatedData,
  ProductDetail,
  ProductSummary,
} from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';

import type { CatalogListQueryDto } from '../common/dto/read-query.dto.js';
import { pageOffset, pageResult } from '../common/pagination.js';
import { ReadModelNotFoundError } from '../common/read-http.js';

const VOICE_CANDIDATE_LIMIT = 100;
const ACCENTED_CHARACTERS: Readonly<Record<string, string>> = {
  a: 'á',
  e: 'é',
  i: 'í',
  n: 'ñ',
  o: 'ó',
  u: 'ú',
};

interface ProductWithCatalogRelations {
  active: boolean;
  code: string;
  group?: ProductSummary['group'] | null;
  id: string;
  minimumStock: { toString(): string };
  name: string;
  unit: ProductSummary['unit'];
}

export interface ProductVoiceCandidates {
  items: readonly ProductSummary[];
  truncated: boolean;
}

function termVariants(term: string): readonly string[] {
  const normalized = term.toLocaleLowerCase('es-NI');
  const variants = new Set([normalized]);
  for (const [index, character] of [...normalized].entries()) {
    const accented = ACCENTED_CHARACTERS[character];
    if (!accented) continue;
    const characters = [...normalized];
    characters[index] = accented;
    variants.add(characters.join(''));
  }
  return [...variants];
}

function toProductSummary(
  product: ProductWithCatalogRelations,
): ProductSummary {
  return {
    ...(product.group ? { group: product.group } : {}),
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
  };
}

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
      include: { unit: true, group: true },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      skip: pageOffset(input),
      take: input.pageSize,
      where,
    });

    return pageResult(products.map(toProductSummary), totalItems, input);
  }

  async searchVoiceCandidates(
    tokens: readonly string[],
    limit = VOICE_CANDIDATE_LIMIT,
  ): Promise<ProductVoiceCandidates> {
    const searchableTerms = [
      ...new Set(
        tokens
          .filter((token) => token.length >= 3)
          .flatMap((token) => termVariants(token)),
      ),
    ];
    if (searchableTerms.length === 0) return { items: [], truncated: false };

    const products = await this.database.product.findMany({
      include: { unit: true, group: true },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      where: {
        active: true,
        OR: searchableTerms.flatMap((term) => [
          { code: { contains: term, mode: 'insensitive' as const } },
          { name: { contains: term, mode: 'insensitive' as const } },
        ]),
      },
    });
    return {
      items: products.slice(0, limit).map(toProductSummary),
      truncated: products.length > limit,
    };
  }

  async get(id: string): Promise<ProductDetail> {
    const product = await this.database.product.findUnique({
      include: { unit: true, group: true },
      where: { id },
    });
    if (!product) throw new ReadModelNotFoundError('product');

    return {
      ...(product.group ? { group: product.group } : {}),
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
