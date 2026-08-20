import type {
  InventoryAdjustmentRequest,
  InventoryAdjustmentResult,
} from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';

import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import { InventoryAuditService } from './inventory-audit.service.js';

type TransactionClient = Omit<
  DatabaseClient,
  '$connect' | '$disconnect' | '$extends' | '$on' | '$transaction'
>;

type LockedBalance = {
  id: string;
  quantity: string;
};

export type InventoryAdjustmentFailure =
  | 'INVENTORY_ADJUSTMENT_CONFLICT'
  | 'INVENTORY_ADJUSTMENT_INVALID'
  | 'INVENTORY_BALANCE_NOT_FOUND'
  | 'INVENTORY_NEGATIVE_BALANCE'
  | 'INVENTORY_PERMISSION_DENIED'
  | 'INVENTORY_PRODUCT_NOT_FOUND'
  | 'INVENTORY_WAREHOUSE_NOT_FOUND';

export class InventoryAdjustmentError extends Error {
  constructor(readonly code: InventoryAdjustmentFailure) {
    super(code);
    this.name = 'InventoryAdjustmentError';
  }
}

export type InventoryClock = { now(): Date };

const systemClock: InventoryClock = { now: () => new Date() };
const decimalPattern = /^([+-]?)(\d{1,14})(?:\.(\d{1,4}))?$/u;
const decimalScale = 4;
const maximumScaledDecimal = 999_999_999_999_999_999n;

function scaledInteger(value: string): bigint {
  const match = decimalPattern.exec(value);
  if (!match) {
    throw new InventoryAdjustmentError('INVENTORY_ADJUSTMENT_INVALID');
  }
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = match[2] ?? '0';
  const fraction = (match[3] ?? '').padEnd(decimalScale, '0');
  return sign * BigInt(`${whole}${fraction}`);
}

function decimalString(value: bigint): string {
  if (value === 0n) return '0';
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const padded = absolute.toString().padStart(decimalScale + 1, '0');
  const whole = padded.slice(0, -decimalScale);
  const fraction = padded.slice(-decimalScale).replace(/0+$/u, '');
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}

export function calculateInventoryAdjustment(
  balanceBefore: string,
  quantityDelta: string,
): { balanceAfter: string; balanceBefore: string; quantityDelta: string } {
  const before = scaledInteger(balanceBefore);
  const delta = scaledInteger(quantityDelta);
  if (delta === 0n) {
    throw new InventoryAdjustmentError('INVENTORY_ADJUSTMENT_INVALID');
  }
  const after = before + delta;
  if (after < 0n) {
    throw new InventoryAdjustmentError('INVENTORY_NEGATIVE_BALANCE');
  }
  if (after > maximumScaledDecimal) {
    throw new InventoryAdjustmentError('INVENTORY_ADJUSTMENT_INVALID');
  }
  return {
    balanceAfter: decimalString(after),
    balanceBefore: decimalString(before),
    quantityDelta: decimalString(delta),
  };
}

function isTransactionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('code' in error && error.code === 'P2034') return true;
  const serialized = error instanceof Error ? error.message : String(error);
  return (
    serialized.includes('40001') ||
    serialized.includes('40P01') ||
    serialized.includes('55P03')
  );
}

export class InventoryAdjustmentService {
  private readonly permissions: EffectivePermissionsService;

  constructor(
    private readonly client: DatabaseClient,
    private readonly audit: InventoryAuditService = new InventoryAuditService(),
    private readonly clock: InventoryClock = systemClock,
  ) {
    this.permissions = new EffectivePermissionsService(client);
  }

  async adjust(
    actorUserId: string,
    input: InventoryAdjustmentRequest,
  ): Promise<InventoryAdjustmentResult> {
    const reason = input.reason.trim();
    if (!reason || reason.length > 500) {
      throw new InventoryAdjustmentError('INVENTORY_ADJUSTMENT_INVALID');
    }

    try {
      return await this.client.$transaction(
        async (transaction) =>
          this.adjustInTransaction(transaction, actorUserId, {
            ...input,
            reason,
          }),
        { isolationLevel: 'ReadCommitted' },
      );
    } catch (error) {
      if (error instanceof InventoryAdjustmentError) throw error;
      if (isTransactionConflict(error)) {
        throw new InventoryAdjustmentError('INVENTORY_ADJUSTMENT_CONFLICT');
      }
      throw error;
    }
  }

  private async adjustInTransaction(
    transaction: TransactionClient,
    actorUserId: string,
    input: InventoryAdjustmentRequest,
  ): Promise<InventoryAdjustmentResult> {
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
        'inventory.adjust',
      ))
    ) {
      throw new InventoryAdjustmentError('INVENTORY_PERMISSION_DENIED');
    }

    const product = await transaction.product.findFirst({
      select: { code: true, id: true, name: true },
      where: { active: true, id: input.productId },
    });
    if (!product) {
      throw new InventoryAdjustmentError('INVENTORY_PRODUCT_NOT_FOUND');
    }
    const warehouse = await transaction.warehouse.findFirst({
      select: { code: true, id: true, name: true },
      where: { active: true, id: input.warehouseId },
    });
    if (!warehouse) {
      throw new InventoryAdjustmentError('INVENTORY_WAREHOUSE_NOT_FOUND');
    }

    const balances = await transaction.$queryRaw<LockedBalance[]>`
      SELECT id, quantity::text AS quantity
      FROM inventory_balances
      WHERE
        product_id = ${input.productId}::uuid
        AND warehouse_id = ${input.warehouseId}::uuid
      FOR UPDATE
    `;
    const balance = balances[0];
    if (!balance) {
      throw new InventoryAdjustmentError('INVENTORY_BALANCE_NOT_FOUND');
    }

    const calculated = calculateInventoryAdjustment(
      balance.quantity,
      input.quantityDelta,
    );
    const occurredAt = this.clock.now();
    const movement = await transaction.inventoryMovement.create({
      data: {
        actorUserId,
        balanceAfter: calculated.balanceAfter,
        balanceBefore: calculated.balanceBefore,
        observation: input.reason,
        occurredAt,
        productId: product.id,
        quantityDelta: calculated.quantityDelta,
        sourceType: 'MANUAL_ADJUSTMENT',
        type: 'ADJUSTMENT',
        warehouseId: warehouse.id,
      },
      select: { id: true },
    });
    await transaction.inventoryBalance.update({
      data: {
        quantity: calculated.balanceAfter,
        version: { increment: 1 },
      },
      where: { id: balance.id },
    });
    await this.audit.recordAdjustment(transaction, {
      actorUserId,
      ...calculated,
      movementId: movement.id,
      occurredAt,
      productId: product.id,
      reason: input.reason,
      warehouseId: warehouse.id,
    });

    return {
      ...calculated,
      movementId: movement.id,
      occurredAt: occurredAt.toISOString(),
      product,
      warehouse,
    };
  }
}
