import type { EditProductInput, ProductInput } from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';
import {
  decimalInput,
  stockCommand,
  StockOperationError,
  type StockTransaction,
} from '../inventory/stock-command.js';
import { ProductReadService } from './product-read.service.js';

export class ProductWriteService {
  constructor(private readonly client: DatabaseClient) {}

  async createInTransaction(
    transaction: StockTransaction,
    actorUserId: string,
    input: ProductInput,
  ) {
    const data = await this.validated(transaction, input);
    await this.lockCode(transaction, data.code);
    if (
      await transaction.product.findUnique({
        where: { code: data.code },
        select: { id: true },
      })
    )
      throw new StockOperationError('PRODUCT_CODE_DUPLICATE');
    const product = await transaction.product.create({ data });
    await transaction.auditLog.create({
      data: {
        actorUserId,
        action: 'product.created',
        entityType: 'Product',
        entityId: product.id,
        afterData: {
          code: data.code,
          name: data.name,
          unitId: data.unitId,
          groupId: data.groupId,
          minimumStock: data.minimumStock.toString(),
        },
      },
    });
    return product;
  }

  async edit(
    actorUserId: string,
    id: string,
    key: string | undefined,
    input: EditProductInput,
  ) {
    await stockCommand(
      this.client,
      actorUserId,
      'product.edit',
      key,
      { id, ...input },
      ['products.manage'],
      async (transaction) => {
        const data = await this.validated(transaction, input);
        // Receipts take the same product-row lock before changing inventory.
        await transaction.$queryRaw`SELECT id FROM products WHERE id = ${id}::uuid FOR UPDATE`;
        const before = await transaction.product.findUnique({ where: { id } });
        if (!before) throw new StockOperationError('STOCK_RESOURCE_NOT_FOUND');
        if (before.updatedAt.toISOString() !== input.expectedUpdatedAt)
          throw new StockOperationError('STOCK_OPERATION_CONFLICT');
        await this.lockCode(transaction, data.code);
        const duplicate = await transaction.product.findFirst({
          where: { code: data.code, NOT: { id } },
          select: { id: true },
        });
        if (duplicate) throw new StockOperationError('PRODUCT_CODE_DUPLICATE');
        if (data.code !== before.code || data.unitId !== before.unitId) {
          const history =
            (await transaction.inventoryBalance.count({
              where: { productId: id },
            })) +
            (await transaction.inventoryMovement.count({
              where: { productId: id },
            })) +
            (await transaction.inventoryCountLine.count({
              where: { productId: id },
            }));
          if (history > 0)
            throw new StockOperationError('PRODUCT_HISTORY_LOCKED');
        }
        const updated = await transaction.product.update({
          where: { id },
          data,
        });
        await transaction.auditLog.create({
          data: {
            actorUserId,
            action: 'product.updated',
            entityType: 'Product',
            entityId: id,
            beforeData: {
              code: before.code,
              name: before.name,
              unitId: before.unitId,
              groupId: before.groupId,
              description: before.description,
              minimumStock: before.minimumStock.toString(),
            },
            afterData: {
              code: updated.code,
              name: updated.name,
              unitId: updated.unitId,
              groupId: updated.groupId,
              description: updated.description,
              minimumStock: updated.minimumStock.toString(),
            },
          },
        });
        return { id };
      },
    );
    return new ProductReadService(this.client).get(id);
  }

  private async lockCode(transaction: StockTransaction, code: string) {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`product.code:${code}`}, 0))`;
  }

  private async validated(transaction: StockTransaction, input: ProductInput) {
    const code = input.code?.trim().toUpperCase(),
      name = input.name?.trim();
    if (
      !code ||
      code.length > 64 ||
      !name ||
      name.length < 2 ||
      name.length > 200 ||
      (input.description?.length ?? 0) > 2000
    )
      throw new StockOperationError('STOCK_REQUEST_INVALID');
    const minimumStock = decimalInput(input.minimumStock);
    const unit = await transaction.unit.findFirst({
      where: { id: input.unitId, active: true },
      select: { id: true },
    });
    const group = await transaction.productGroup.findFirst({
      where: { id: input.groupId, active: true },
      select: { id: true },
    });
    if (!unit || !group)
      throw new StockOperationError('STOCK_RESOURCE_NOT_FOUND');
    return {
      code,
      name,
      minimumStock,
      unitId: unit.id,
      groupId: group.id,
      description: input.description?.trim() || null,
    };
  }
}
