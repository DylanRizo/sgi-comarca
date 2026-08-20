import type {
  InventoryTransferRequest,
  InventoryTransferResult,
} from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';
import { createHash, randomUUID } from 'node:crypto';

import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import { InventoryAuditService } from './inventory-audit.service.js';
import {
  inventoryDecimalString,
  inventoryScaledInteger,
  maximumScaledInventoryQuantity,
} from './inventory-quantity.js';

type TransactionClient = Omit<
  DatabaseClient,
  '$connect' | '$disconnect' | '$extends' | '$on' | '$transaction'
>;

type LockedProduct = { code: string; id: string; name: string };
type LockedWarehouse = {
  active: boolean;
  code: string;
  id: string;
  name: string;
};
type LockedBalance = { id: string; quantity: string; warehouse_id: string };

export type InventoryTransferFailure =
  | 'IDEMPOTENCY_KEY_INVALID'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'INVENTORY_PERMISSION_DENIED'
  | 'INVENTORY_TRANSFER_CONFLICT'
  | 'INVENTORY_TRANSFER_INSUFFICIENT_STOCK'
  | 'INVENTORY_TRANSFER_INVALID'
  | 'INVENTORY_TRANSFER_PRODUCT_NOT_FOUND'
  | 'INVENTORY_TRANSFER_SOURCE_BALANCE_NOT_FOUND'
  | 'INVENTORY_TRANSFER_WAREHOUSE_NOT_FOUND';

export class InventoryTransferError extends Error {
  constructor(readonly code: InventoryTransferFailure) {
    super(code);
    this.name = 'InventoryTransferError';
  }
}

export type InventoryTransferClock = { now(): Date };
const systemClock: InventoryTransferClock = { now: () => new Date() };
const idempotencyKeyPattern = /^[\x21-\x7e]{16,128}$/u;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function positiveQuantity(value: string): bigint {
  const parsed = inventoryScaledInteger(value);
  if (
    parsed === null ||
    parsed <= 0n ||
    parsed > maximumScaledInventoryQuantity
  ) {
    throw new InventoryTransferError('INVENTORY_TRANSFER_INVALID');
  }
  return parsed;
}

export function canonicalInventoryTransferRequest(
  input: InventoryTransferRequest,
): string {
  const quantity = inventoryDecimalString(positiveQuantity(input.quantity));
  return JSON.stringify({
    fromWarehouseId: input.fromWarehouseId,
    productId: input.productId,
    quantity,
    reason: input.reason,
    toWarehouseId: input.toWarehouseId,
  });
}

function transactionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('code' in error && ['P2002', 'P2034'].includes(String(error.code))) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return ['40001', '40P01', '55P03'].some((code) => message.includes(code));
}

function warehouseSummary(warehouse: LockedWarehouse) {
  return {
    active: warehouse.active,
    code: warehouse.code,
    id: warehouse.id,
    name: warehouse.name,
  };
}

export class InventoryTransferService {
  private readonly permissions: EffectivePermissionsService;

  constructor(
    private readonly client: DatabaseClient,
    private readonly audit: InventoryAuditService = new InventoryAuditService(),
    private readonly clock: InventoryTransferClock = systemClock,
  ) {
    this.permissions = new EffectivePermissionsService(client);
  }

  async transfer(
    actorUserId: string,
    idempotencyKey: string | undefined,
    rawInput: InventoryTransferRequest,
  ): Promise<InventoryTransferResult> {
    if (idempotencyKey === undefined) {
      throw new InventoryTransferError('IDEMPOTENCY_KEY_REQUIRED');
    }
    if (!idempotencyKeyPattern.test(idempotencyKey)) {
      throw new InventoryTransferError('IDEMPOTENCY_KEY_INVALID');
    }
    const reason = rawInput.reason.trim();
    if (
      !reason ||
      reason.length > 500 ||
      rawInput.fromWarehouseId === rawInput.toWarehouseId
    ) {
      throw new InventoryTransferError('INVENTORY_TRANSFER_INVALID');
    }
    const quantityScaled = positiveQuantity(rawInput.quantity);
    const input = {
      ...rawInput,
      quantity: inventoryDecimalString(quantityScaled),
      reason,
    };
    const idempotencyKeyHash = sha256(idempotencyKey);
    const requestHash = sha256(canonicalInventoryTransferRequest(input));

    try {
      return await this.client.$transaction(
        (transaction) =>
          this.transferInTransaction(transaction, actorUserId, input, {
            idempotencyKeyHash,
            quantityScaled,
            requestHash,
          }),
        { isolationLevel: 'ReadCommitted', timeout: 10_000 },
      );
    } catch (error) {
      if (error instanceof InventoryTransferError) throw error;
      if (transactionConflict(error)) {
        throw new InventoryTransferError('INVENTORY_TRANSFER_CONFLICT');
      }
      throw error;
    }
  }

  private async transferInTransaction(
    transaction: TransactionClient,
    actorUserId: string,
    input: InventoryTransferRequest,
    hashes: {
      idempotencyKeyHash: string;
      quantityScaled: bigint;
      requestHash: string;
    },
  ): Promise<InventoryTransferResult> {
    const actor = await transaction.user.findUnique({
      select: { activatedAt: true, status: true },
      where: { id: actorUserId },
    });
    if (
      !actor ||
      actor.status !== 'ACTIVE' ||
      !actor.activatedAt ||
      !(await this.permissions.hasPermissionUsing(
        transaction,
        actorUserId,
        'transfers.create',
      ))
    ) {
      throw new InventoryTransferError('INVENTORY_PERMISSION_DENIED');
    }

    const idempotencyScope = `inventory.transfer:${actorUserId}:${hashes.idempotencyKeyHash}`;
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyScope}, 0))
    `;
    const existing = await transaction.inventoryTransfer.findUnique({
      include: {
        fromWarehouse: true,
        items: {
          include: {
            movements: true,
            product: { select: { code: true, id: true, name: true } },
          },
        },
        toWarehouse: true,
      },
      where: {
        actorUserId_idempotencyKeyHash: {
          actorUserId,
          idempotencyKeyHash: hashes.idempotencyKeyHash,
        },
      },
    });
    if (existing) {
      if (existing.requestHash !== hashes.requestHash) {
        throw new InventoryTransferError('IDEMPOTENCY_KEY_REUSED');
      }
      const total = await this.totalQuantity(transaction, input.productId);
      const item = existing.items[0];
      const out = item?.movements.find(({ type }) => type === 'TRANSFER_OUT');
      const incoming = item?.movements.find(
        ({ type }) => type === 'TRANSFER_IN',
      );
      if (!item || !out || !incoming) {
        throw new InventoryTransferError('INVENTORY_TRANSFER_CONFLICT');
      }
      return {
        destinationBalanceAfter: incoming.balanceAfter.toString(),
        destinationBalanceBefore: incoming.balanceBefore.toString(),
        fromWarehouse: warehouseSummary(existing.fromWarehouse),
        movements: { inId: incoming.id, outId: out.id },
        occurredAt: existing.occurredAt.toISOString(),
        originBalanceAfter: out.balanceAfter.toString(),
        originBalanceBefore: out.balanceBefore.toString(),
        product: item.product,
        quantity: item.quantity.toString(),
        reason: existing.reason,
        stockTotal: inventoryDecimalString(total),
        toWarehouse: warehouseSummary(existing.toWarehouse),
        transferId: existing.id,
        transferItemId: item.id,
      };
    }

    const products = await transaction.$queryRaw<LockedProduct[]>`
      SELECT id, code, name
      FROM products
      WHERE id = ${input.productId}::uuid AND active = true
      FOR UPDATE
    `;
    const product = products[0];
    if (!product) {
      throw new InventoryTransferError('INVENTORY_TRANSFER_PRODUCT_NOT_FOUND');
    }
    const warehouses = await transaction.$queryRaw<LockedWarehouse[]>`
      SELECT id, code, name, active
      FROM warehouses
      WHERE id IN (${input.fromWarehouseId}::uuid, ${input.toWarehouseId}::uuid)
      ORDER BY id
      FOR UPDATE
    `;
    if (warehouses.length !== 2 || warehouses.some(({ active }) => !active)) {
      throw new InventoryTransferError(
        'INVENTORY_TRANSFER_WAREHOUSE_NOT_FOUND',
      );
    }
    const fromWarehouse = warehouses.find(
      ({ id }) => id === input.fromWarehouseId,
    );
    const toWarehouse = warehouses.find(({ id }) => id === input.toWarehouseId);
    if (!fromWarehouse || !toWarehouse) {
      throw new InventoryTransferError(
        'INVENTORY_TRANSFER_WAREHOUSE_NOT_FOUND',
      );
    }

    await transaction.$executeRaw`
      INSERT INTO inventory_balances
        (id, product_id, warehouse_id, quantity, created_at, updated_at)
      VALUES
        (${randomUUID()}::uuid, ${product.id}::uuid, ${toWarehouse.id}::uuid, 0, now(), now())
      ON CONFLICT (product_id, warehouse_id) DO NOTHING
    `;
    const balances = await transaction.$queryRaw<LockedBalance[]>`
      SELECT id, warehouse_id, quantity::text AS quantity
      FROM inventory_balances
      WHERE product_id = ${product.id}::uuid
      ORDER BY warehouse_id
      FOR UPDATE
    `;
    const source = balances.find(
      ({ warehouse_id }) => warehouse_id === fromWarehouse.id,
    );
    const destination = balances.find(
      ({ warehouse_id }) => warehouse_id === toWarehouse.id,
    );
    if (!source) {
      throw new InventoryTransferError(
        'INVENTORY_TRANSFER_SOURCE_BALANCE_NOT_FOUND',
      );
    }
    if (!destination) {
      throw new InventoryTransferError('INVENTORY_TRANSFER_CONFLICT');
    }
    const sourceBefore = inventoryScaledInteger(source.quantity);
    const destinationBefore = inventoryScaledInteger(destination.quantity);
    if (sourceBefore === null || destinationBefore === null) {
      throw new InventoryTransferError('INVENTORY_TRANSFER_CONFLICT');
    }
    if (sourceBefore < hashes.quantityScaled) {
      throw new InventoryTransferError('INVENTORY_TRANSFER_INSUFFICIENT_STOCK');
    }
    const sourceAfter = sourceBefore - hashes.quantityScaled;
    const destinationAfter = destinationBefore + hashes.quantityScaled;
    if (destinationAfter > maximumScaledInventoryQuantity) {
      throw new InventoryTransferError('INVENTORY_TRANSFER_INVALID');
    }
    const totalBefore = balances.reduce((total, balance) => {
      const value = inventoryScaledInteger(balance.quantity);
      if (value === null) {
        throw new InventoryTransferError('INVENTORY_TRANSFER_CONFLICT');
      }
      return total + value;
    }, 0n);

    const occurredAt = this.clock.now();
    const transfer = await transaction.inventoryTransfer.create({
      data: {
        actorUserId,
        fromWarehouseId: fromWarehouse.id,
        idempotencyKeyHash: hashes.idempotencyKeyHash,
        occurredAt,
        reason: input.reason,
        requestHash: hashes.requestHash,
        toWarehouseId: toWarehouse.id,
      },
      select: { id: true },
    });
    const item = await transaction.inventoryTransferItem.create({
      data: {
        productId: product.id,
        quantity: input.quantity,
        transferId: transfer.id,
      },
      select: { id: true },
    });
    await transaction.inventoryBalance.update({
      data: {
        quantity: inventoryDecimalString(sourceAfter),
        version: { increment: 1 },
      },
      where: { id: source.id },
    });
    await transaction.inventoryBalance.update({
      data: {
        quantity: inventoryDecimalString(destinationAfter),
        version: { increment: 1 },
      },
      where: { id: destination.id },
    });
    const outgoing = await transaction.inventoryMovement.create({
      data: {
        actorUserId,
        balanceAfter: inventoryDecimalString(sourceAfter),
        balanceBefore: inventoryDecimalString(sourceBefore),
        observation: input.reason,
        occurredAt,
        productId: product.id,
        quantityDelta: inventoryDecimalString(-hashes.quantityScaled),
        sourceId: transfer.id,
        sourceType: 'INVENTORY_TRANSFER',
        transferItemId: item.id,
        type: 'TRANSFER_OUT',
        warehouseId: fromWarehouse.id,
      },
      select: { id: true },
    });
    const incoming = await transaction.inventoryMovement.create({
      data: {
        actorUserId,
        balanceAfter: inventoryDecimalString(destinationAfter),
        balanceBefore: inventoryDecimalString(destinationBefore),
        observation: input.reason,
        occurredAt,
        productId: product.id,
        quantityDelta: input.quantity,
        sourceId: transfer.id,
        sourceType: 'INVENTORY_TRANSFER',
        transferItemId: item.id,
        type: 'TRANSFER_IN',
        warehouseId: toWarehouse.id,
      },
      select: { id: true },
    });
    await this.audit.recordTransfer(transaction, {
      actorUserId,
      fromWarehouseId: fromWarehouse.id,
      incomingMovementId: incoming.id,
      outgoingMovementId: outgoing.id,
      occurredAt,
      productId: product.id,
      quantity: input.quantity,
      reason: input.reason,
      toWarehouseId: toWarehouse.id,
      transferId: transfer.id,
      transferItemId: item.id,
    });

    const totalAfter =
      totalBefore - hashes.quantityScaled + hashes.quantityScaled;
    if (totalAfter !== totalBefore) {
      throw new InventoryTransferError('INVENTORY_TRANSFER_CONFLICT');
    }
    return {
      destinationBalanceAfter: inventoryDecimalString(destinationAfter),
      destinationBalanceBefore: inventoryDecimalString(destinationBefore),
      fromWarehouse: warehouseSummary(fromWarehouse),
      movements: { inId: incoming.id, outId: outgoing.id },
      occurredAt: occurredAt.toISOString(),
      originBalanceAfter: inventoryDecimalString(sourceAfter),
      originBalanceBefore: inventoryDecimalString(sourceBefore),
      product,
      quantity: input.quantity,
      reason: input.reason,
      stockTotal: inventoryDecimalString(totalBefore),
      toWarehouse: warehouseSummary(toWarehouse),
      transferId: transfer.id,
      transferItemId: item.id,
    };
  }

  private async totalQuantity(
    transaction: TransactionClient,
    productId: string,
  ): Promise<bigint> {
    const balances = await transaction.inventoryBalance.findMany({
      select: { quantity: true },
      where: { productId },
    });
    return balances.reduce((total, { quantity }) => {
      const value = inventoryScaledInteger(quantity.toString());
      if (value === null) {
        throw new InventoryTransferError('INVENTORY_TRANSFER_CONFLICT');
      }
      return total + value;
    }, 0n);
  }
}
