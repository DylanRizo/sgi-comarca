import type { DatabaseClient } from '@sgi/database';
import type { ProductGroupView } from '@sgi/contracts';
import {
  stockCommand,
  StockOperationError,
} from '../inventory/stock-command.js';

export class ProductCatalogService {
  constructor(private readonly client: DatabaseClient) {}
  async groups(): Promise<ProductGroupView[]> {
    return this.client.productGroup.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }
  async create(actor: string, key: string | undefined, name: string) {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 120)
      throw new StockOperationError('STOCK_REQUEST_INVALID');
    const result = await stockCommand(
      this.client,
      actor,
      'product.group.create',
      key,
      { name: trimmed },
      ['products.manage'],
      async (transaction) => {
        const code = trimmed
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/gu, '')
          .toUpperCase()
          .replace(/[^A-Z0-9]+/gu, '_')
          .replace(/^_|_$/gu, '')
          .slice(0, 64);
        if (!code) throw new StockOperationError('STOCK_REQUEST_INVALID');
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`group:${code}`}, 0))`;
        const existing = await transaction.productGroup.findUnique({
          where: { code },
        });
        if (existing) throw new StockOperationError('STOCK_OPERATION_CONFLICT');
        const group = await transaction.productGroup.create({
          data: { code, name: trimmed },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor,
            action: 'product.group.created',
            entityType: 'ProductGroup',
            entityId: group.id,
            afterData: { name: group.name, code },
          },
        });
        return { id: group.id };
      },
    );
    return this.client.productGroup.findUniqueOrThrow({
      where: { id: result.id },
    });
  }
}
