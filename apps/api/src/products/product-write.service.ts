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
    if (
      input.materialsDescription?.trim() ||
      input.measurementChart?.trim() ||
      input.photosUrl?.trim()
    ) {
      const allowed = await this.isEnrichmentAuthorized(
        transaction,
        actorUserId,
      );
      if (!allowed) throw new StockOperationError('STOCK_PERMISSION_DENIED');
    }
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
          materialsDescription: data.materialsDescription,
          measurementChart: data.measurementChart,
          photosUrl: data.photosUrl,
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
        // Receipts take the same product-row lock before changing inventory.
        await transaction.$queryRaw`SELECT id FROM products WHERE id = ${id}::uuid FOR UPDATE`;
        const before = await transaction.product.findUnique({ where: { id } });
        if (!before) throw new StockOperationError('STOCK_RESOURCE_NOT_FOUND');
        if (before.updatedAt.toISOString() !== input.expectedUpdatedAt)
          throw new StockOperationError('STOCK_OPERATION_CONFLICT');

        const materialsChanging =
          input.materialsDescription !== undefined &&
          (input.materialsDescription?.trim() || null) !==
            before.materialsDescription;
        const measurementsChanging =
          input.measurementChart !== undefined &&
          (input.measurementChart?.trim() || null) !== before.measurementChart;
        const photosChanging =
          input.photosUrl !== undefined &&
          (input.photosUrl?.trim() || null) !== before.photosUrl;

        if (materialsChanging || measurementsChanging || photosChanging) {
          const allowed = await this.isEnrichmentAuthorized(
            transaction,
            actorUserId,
          );
          if (!allowed)
            throw new StockOperationError('STOCK_PERMISSION_DENIED');
        }

        const data = await this.validated(transaction, input, before);
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
              materialsDescription: before.materialsDescription,
              measurementChart: before.measurementChart,
              photosUrl: before.photosUrl,
            },
            afterData: {
              code: updated.code,
              name: updated.name,
              unitId: updated.unitId,
              groupId: updated.groupId,
              description: updated.description,
              minimumStock: updated.minimumStock.toString(),
              materialsDescription: updated.materialsDescription,
              measurementChart: updated.measurementChart,
              photosUrl: updated.photosUrl,
            },
          },
        });
        return { id };
      },
    );
    return new ProductReadService(this.client).get(id);
  }

  private async isEnrichmentAuthorized(
    transaction: StockTransaction,
    actorUserId: string,
  ): Promise<boolean> {
    const actor = await transaction.user.findUnique({
      where: { id: actorUserId },
      select: {
        loginIdentifier: true,
        userRoles: {
          where: { revokedAt: null, role: { code: 'ADMIN' } },
          select: { id: true },
        },
      },
    });
    return (
      Boolean(actor?.userRoles.length) || actor?.loginIdentifier === 'luden'
    );
  }

  private async lockCode(transaction: StockTransaction, code: string) {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`product.code:${code}`}, 0))`;
  }

  private async validated(
    transaction: StockTransaction,
    input: ProductInput,
    before?: {
      materialsDescription: string | null;
      measurementChart: string | null;
      photosUrl: string | null;
    },
  ) {
    const code = input.code?.trim().toUpperCase(),
      name = input.name?.trim();
    if (
      !code ||
      code.length > 64 ||
      !name ||
      name.length < 2 ||
      name.length > 200 ||
      (input.description?.length ?? 0) > 2000 ||
      (input.materialsDescription?.length ?? 0) > 4000 ||
      (input.measurementChart?.length ?? 0) > 8000 ||
      (input.photosUrl?.length ?? 0) > 1024
    )
      throw new StockOperationError('STOCK_REQUEST_INVALID');

    const trimmedPhotosUrl = input.photosUrl?.trim() || null;
    if (trimmedPhotosUrl && !/^https?:\/\/.+/iu.test(trimmedPhotosUrl)) {
      throw new StockOperationError('STOCK_REQUEST_INVALID');
    }

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

    const materialsDescription =
      input.materialsDescription === undefined && before
        ? before.materialsDescription
        : input.materialsDescription?.trim() || null;

    const measurementChart =
      input.measurementChart === undefined && before
        ? before.measurementChart
        : input.measurementChart?.trim() || null;

    const photosUrl =
      input.photosUrl === undefined && before
        ? before.photosUrl
        : trimmedPhotosUrl;

    return {
      code,
      name,
      minimumStock,
      unitId: unit.id,
      groupId: group.id,
      description: input.description?.trim() || null,
      materialsDescription,
      measurementChart,
      photosUrl,
    };
  }
}
