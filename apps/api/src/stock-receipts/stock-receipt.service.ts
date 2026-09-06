import type {
  CreateProductInput,
  PaginatedData,
  ProductCreatedView,
  ReceiptInput,
  ReceiptView,
} from '@sgi/contracts';
import type { Prisma, DatabaseClient } from '@sgi/database';
import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import { ProductReadService } from '../products/product-read.service.js';
import { ProductWriteService } from '../products/product-write.service.js';
import {
  authorizeStock,
  decimalInput,
  stockCommand,
  StockOperationError,
  type StockTransaction,
} from '../inventory/stock-command.js';

const include = {
  actor: { select: { id: true, displayName: true } },
  items: {
    include: {
      product: { select: { id: true, code: true, name: true } },
      warehouse: true,
      movement: true,
    },
  },
} as const;

export class StockReceiptService {
  constructor(private readonly client: DatabaseClient) {}

  async createProduct(
    actor: string,
    key: string | undefined,
    input: CreateProductInput,
  ): Promise<ProductCreatedView> {
    const permissions = [
      'products.manage',
      'inventory.read',
      ...(input.initialReceipt ? ['stock-receipts.create'] : []),
    ];
    const ids = await stockCommand(
      this.client,
      actor,
      'product.create',
      key,
      input,
      permissions,
      async (transaction) => {
        const product = await new ProductWriteService(
          this.client,
        ).createInTransaction(transaction, actor, input);
        const receiptId = input.initialReceipt
          ? await this.receive(transaction, actor, {
              ...input.initialReceipt,
              productId: product.id,
            })
          : null;
        return { productId: product.id, receiptId };
      },
    );
    return {
      product: await new ProductReadService(this.client).get(ids.productId),
      receipt: ids.receiptId ? await this.get(actor, ids.receiptId) : null,
    };
  }

  async create(
    actor: string,
    key: string | undefined,
    input: ReceiptInput,
  ): Promise<ReceiptView> {
    const result = await stockCommand(
      this.client,
      actor,
      'receipt.create',
      key,
      input,
      ['stock-receipts.create', 'inventory.read'],
      async (transaction) => ({
        id: await this.receive(transaction, actor, input),
      }),
    );
    return this.get(actor, result.id);
  }

  async get(actor: string, id: string): Promise<ReceiptView> {
    await authorizeStock(this.client, actor, 'inventory.read');
    const receipt = await this.client.stockReceipt.findUnique({
      where: { id },
      include,
    });
    if (!receipt) throw new StockOperationError('STOCK_RESOURCE_NOT_FOUND');
    return this.view(receipt, await this.canReadCost(actor));
  }

  async list(
    actor: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedData<ReceiptView>> {
    await authorizeStock(this.client, actor, 'inventory.read');
    const [totalItems, receipts, canCost] = await Promise.all([
      this.client.stockReceipt.count(),
      this.client.stockReceipt.findMany({
        include,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.canReadCost(actor),
    ]);
    return {
      items: receipts.map((receipt) => this.view(receipt, canCost)),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      },
    };
  }

  private canReadCost(actor: string) {
    return new EffectivePermissionsService(this.client).hasPermission(
      actor,
      'finances.read',
    );
  }

  private view(
    receipt: Prisma.StockReceiptGetPayload<{ include: typeof include }>,
    canCost: boolean,
  ): ReceiptView {
    return {
      id: receipt.id,
      actor: receipt.actor,
      reason: receipt.reason,
      occurredAt: receipt.occurredAt.toISOString(),
      items: receipt.items.map((item) => ({
        id: item.id,
        product: item.product,
        warehouse: {
          id: item.warehouse.id,
          code: item.warehouse.code,
          name: item.warehouse.name,
          active: item.warehouse.active,
        },
        quantity: item.quantity.toString(),
        unitCost: canCost ? (item.unitCost?.toFixed(2) ?? null) : null,
        unitPrice: item.unitPrice?.toFixed(2) ?? null,
        movementId: item.movementId,
        balanceBefore: item.movement.balanceBefore.toString(),
        balanceAfter: item.movement.balanceAfter.toString(),
      })),
    };
  }

  private async receive(
    transaction: StockTransaction,
    actor: string,
    input: ReceiptInput,
  ): Promise<string> {
    const quantity = decimalInput(input.quantity, false, true);
    const reason = input.reason?.trim();
    if (!reason || reason.length > 500)
      throw new StockOperationError('STOCK_REQUEST_INVALID');
    if (input.unitCost !== undefined || input.unitPrice !== undefined)
      await authorizeStock(
        transaction,
        actor,
        'inventory.valuation.manage',
        'finances.read',
      );
    const suppliedCost =
      input.unitCost === undefined
        ? undefined
        : decimalInput(input.unitCost, true);
    const suppliedPrice =
      input.unitPrice === undefined
        ? undefined
        : decimalInput(input.unitPrice, true, true);
    await transaction.$queryRaw`SELECT id FROM products WHERE id = ${input.productId}::uuid FOR UPDATE`;
    const product = await transaction.product.findFirst({
      where: { id: input.productId, active: true },
      select: { id: true },
    });
    await transaction.$queryRaw`SELECT id FROM warehouses WHERE id = ${input.warehouseId}::uuid FOR SHARE`;
    const warehouse = await transaction.warehouse.findFirst({
      where: { id: input.warehouseId, active: true },
      select: { id: true },
    });
    if (!product || !warehouse)
      throw new StockOperationError('STOCK_RESOURCE_NOT_FOUND');
    await transaction.inventoryBalance.upsert({
      where: {
        productId_warehouseId: {
          productId: product.id,
          warehouseId: warehouse.id,
        },
      },
      create: {
        productId: product.id,
        warehouseId: warehouse.id,
        quantity: '0',
      },
      update: {},
    });
    const rows = await transaction.$queryRaw<
      { id: string }[]
    >`SELECT id FROM inventory_balances WHERE product_id = ${product.id}::uuid AND warehouse_id = ${warehouse.id}::uuid FOR UPDATE`;
    const balance = await transaction.inventoryBalance.findUniqueOrThrow({
      where: { id: rows[0]!.id },
    });
    const after = balance.quantity.add(quantity);
    if (after.gt('99999999999999.9999'))
      throw new StockOperationError('STOCK_REQUEST_INVALID');
    const unitCost = suppliedCost ?? balance.currentUnitCost;
    const unitPrice = suppliedPrice ?? balance.currentUnitPrice;
    const occurredAt = new Date();
    const receipt = await transaction.stockReceipt.create({
      data: { actorUserId: actor, reason, occurredAt },
    });
    const movement = await transaction.inventoryMovement.create({
      data: {
        productId: product.id,
        warehouseId: warehouse.id,
        type: 'RECEIPT',
        quantityDelta: quantity,
        balanceBefore: balance.quantity,
        balanceAfter: after,
        occurredAt,
        actorUserId: actor,
        sourceType: 'STOCK_RECEIPT',
        sourceId: receipt.id,
        observation: reason,
      },
    });
    await transaction.stockReceiptItem.create({
      data: {
        receiptId: receipt.id,
        productId: product.id,
        warehouseId: warehouse.id,
        quantity,
        unitCost,
        unitPrice,
        movementId: movement.id,
      },
    });
    await transaction.inventoryBalance.update({
      where: { id: balance.id },
      data: {
        quantity: after,
        version: { increment: 1 },
        currentUnitCost: unitCost,
        currentUnitPrice: unitPrice,
        costReviewRequired:
          suppliedCost !== undefined
            ? suppliedCost.isZero()
            : balance.costReviewRequired || unitCost === null,
        priceReviewRequired:
          suppliedPrice !== undefined
            ? false
            : balance.priceReviewRequired || unitPrice === null,
      },
    });
    if (suppliedCost !== undefined || suppliedPrice !== undefined)
      await transaction.productWarehouseValuation.create({
        data: {
          productId: product.id,
          warehouseId: warehouse.id,
          unitCost,
          unitPrice,
          observedAt: occurredAt,
          requiresHumanReview: unitCost === null || unitCost.isZero(),
          reviewReason:
            unitCost === null || unitCost.isZero()
              ? 'Costo pendiente de revisión'
              : null,
        },
      });
    await transaction.auditLog.create({
      data: {
        actorUserId: actor,
        action: 'stock.received',
        entityType: 'StockReceipt',
        entityId: receipt.id,
        beforeData: { quantity: balance.quantity.toString() },
        afterData: { quantity: after.toString() },
        metadata: {
          productId: product.id,
          warehouseId: warehouse.id,
          movementId: movement.id,
          reason,
        },
        occurredAt,
      },
    });
    return receipt.id;
  }
}
