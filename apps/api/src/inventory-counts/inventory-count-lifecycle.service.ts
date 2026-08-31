import type { InventoryCountSessionView } from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';
import { randomUUID } from 'node:crypto';

import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import { InventoryAdjustmentError } from '../inventory/inventory-adjustment.service.js';
import type { InventoryAdjustmentService } from '../inventory/inventory-adjustment.service.js';
import { inventoryScaledInteger } from '../inventory/inventory-quantity.js';
import {
  InventoryCountAuditService,
  type InventoryCountAdjustmentAuditEntry,
} from './inventory-count-audit.service.js';
import { InventoryCountError } from './inventory-count.errors.js';
import { loadSessionView } from './inventory-count.view.js';

type TransactionClient = Omit<
  DatabaseClient,
  '$connect' | '$disconnect' | '$extends' | '$on' | '$transaction'
>;

type LockedBalance = {
  product_id: string;
  quantity: string;
  warehouse_id: string;
};

export type InventoryCountClock = { now(): Date };
const systemClock: InventoryCountClock = { now: () => new Date() };

/** Decimal comparison stays exact: quantities are compared as scaled integers. */
function scaled(value: string): bigint {
  const parsed = inventoryScaledInteger(value);
  if (parsed === null) {
    throw new InventoryCountError('INVENTORY_COUNT_CONFLICT');
  }
  return parsed;
}

function transactionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('code' in error && ['P2002', 'P2034'].includes(String(error.code))) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return ['40001', '40P01', '55P03'].some((code) => message.includes(code));
}

/**
 * A nested adjustment failure must not escape as an opaque 500: translate it
 * into this module's own public codes.
 */
function translateAdjustmentError(error: unknown): never {
  if (error instanceof InventoryAdjustmentError) {
    switch (error.code) {
      case 'INVENTORY_NEGATIVE_BALANCE':
        throw new InventoryCountError('INVENTORY_COUNT_NEGATIVE_BALANCE');
      case 'INVENTORY_PERMISSION_DENIED':
        throw new InventoryCountError('INVENTORY_COUNT_APPROVER_CANNOT_ADJUST');
      case 'INVENTORY_PRODUCT_NOT_FOUND':
        throw new InventoryCountError('INVENTORY_COUNT_PRODUCT_NOT_FOUND');
      case 'INVENTORY_WAREHOUSE_NOT_FOUND':
        throw new InventoryCountError('INVENTORY_COUNT_WAREHOUSE_NOT_FOUND');
      case 'INVENTORY_ADJUSTMENT_CONFLICT':
        throw new InventoryCountError('INVENTORY_COUNT_CONFLICT');
      default:
        throw new InventoryCountError('INVENTORY_COUNT_ADJUSTMENT_FAILED');
    }
  }
  throw error;
}

/**
 * Submission, approval and cancellation of a physical count (plan §4, 9B.1).
 *
 * Approval never writes stock itself: it delegates every adjustment to the
 * FASE 5C atomic path, inside this transaction, so the AGENTS.md invariant that
 * a stock change always produces one immutable movement keeps being enforced by
 * the database. The approval, its adjustments and the line links all commit
 * together, which is what the deferred FASE 9A triggers validate.
 *
 * Submit, approve and cancel are idempotent by effect rather than by key: the
 * 9A schema carries idempotency columns for creation only, so each transition
 * locks the session row and returns the current view when the target state
 * already holds.
 */
export class InventoryCountLifecycleService {
  private readonly permissions: EffectivePermissionsService;

  constructor(
    private readonly client: DatabaseClient,
    private readonly adjustments: InventoryAdjustmentService,
    private readonly audit: InventoryCountAuditService = new InventoryCountAuditService(),
    private readonly clock: InventoryCountClock = systemClock,
  ) {
    this.permissions = new EffectivePermissionsService(client);
  }

  async submit(
    actorUserId: string,
    sessionId: string,
  ): Promise<InventoryCountSessionView> {
    return this.run((transaction) =>
      this.submitInTransaction(transaction, actorUserId, sessionId),
    );
  }

  async approve(
    actorUserId: string,
    sessionId: string,
  ): Promise<InventoryCountSessionView> {
    return this.run((transaction) =>
      this.approveInTransaction(transaction, actorUserId, sessionId),
    );
  }

  async cancel(
    actorUserId: string,
    sessionId: string,
    rawReason: string,
  ): Promise<InventoryCountSessionView> {
    const reason = rawReason?.trim() ?? '';
    if (!reason || reason.length > 500) {
      throw new InventoryCountError('INVENTORY_COUNT_REQUEST_INVALID');
    }
    return this.run((transaction) =>
      this.cancelInTransaction(transaction, actorUserId, sessionId, reason),
    );
  }

  private async run(
    operation: (
      transaction: TransactionClient,
    ) => Promise<InventoryCountSessionView>,
  ): Promise<InventoryCountSessionView> {
    try {
      return await this.client.$transaction(operation, {
        isolationLevel: 'ReadCommitted',
        timeout: 30_000,
      });
    } catch (error) {
      if (error instanceof InventoryCountError) throw error;
      if (transactionConflict(error)) {
        throw new InventoryCountError('INVENTORY_COUNT_CONFLICT');
      }
      throw error;
    }
  }

  private async assertActive(
    transaction: TransactionClient,
    actorUserId: string,
  ): Promise<void> {
    const actor = await transaction.user.findUnique({
      select: { activatedAt: true, status: true },
      where: { id: actorUserId },
    });
    if (!actor || actor.status !== 'ACTIVE' || !actor.activatedAt) {
      throw new InventoryCountError('INVENTORY_COUNT_PERMISSION_DENIED');
    }
  }

  private async authorize(
    transaction: TransactionClient,
    actorUserId: string,
    permission: string,
  ): Promise<void> {
    await this.assertActive(transaction, actorUserId);
    if (
      !(await this.permissions.hasPermissionUsing(
        transaction,
        actorUserId,
        permission,
      ))
    ) {
      throw new InventoryCountError('INVENTORY_COUNT_PERMISSION_DENIED');
    }
  }

  /** Serialize concurrent lifecycle work on the same session. */
  private async lockSession(
    transaction: TransactionClient,
    sessionId: string,
  ): Promise<{ status: string }> {
    const rows = await transaction.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status
      FROM inventory_count_sessions
      WHERE id = ${sessionId}::uuid
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) {
      throw new InventoryCountError('INVENTORY_COUNT_SESSION_NOT_FOUND');
    }
    return row;
  }

  private async submitInTransaction(
    transaction: TransactionClient,
    actorUserId: string,
    sessionId: string,
  ): Promise<InventoryCountSessionView> {
    await this.authorize(transaction, actorUserId, 'inventory.audit.create');

    const current = await this.lockSession(transaction, sessionId);
    if (current.status === 'PENDING_APPROVAL') {
      return loadSessionView(transaction, sessionId);
    }
    if (current.status !== 'OPEN') {
      throw new InventoryCountError('INVENTORY_COUNT_INVALID_STATE');
    }

    // An empty session can never be approved, so refuse to strand it here.
    const lineCount = await transaction.inventoryCountLine.count({
      where: { sessionId },
    });
    if (lineCount === 0) {
      throw new InventoryCountError('INVENTORY_COUNT_REQUIRES_LINES');
    }

    const submittedAt = this.clock.now();
    await transaction.inventoryCountSession.update({
      data: { status: 'PENDING_APPROVAL', submittedAt },
      where: { id: sessionId },
    });
    await this.audit.recordSessionSubmitted(transaction, {
      actorUserId,
      lineCount,
      occurredAt: submittedAt,
      sessionId,
    });

    return loadSessionView(transaction, sessionId);
  }

  private async approveInTransaction(
    transaction: TransactionClient,
    actorUserId: string,
    sessionId: string,
  ): Promise<InventoryCountSessionView> {
    await this.authorize(transaction, actorUserId, 'inventory.audit.approve');
    // Approving writes the adjustments, and the FASE 5C path re-checks
    // `inventory.adjust` against this same actor. Fail with a clear code here
    // instead of surfacing a confusing permission error from inside it.
    if (
      !(await this.permissions.hasPermissionUsing(
        transaction,
        actorUserId,
        'inventory.adjust',
      ))
    ) {
      throw new InventoryCountError('INVENTORY_COUNT_APPROVER_CANNOT_ADJUST');
    }

    const current = await this.lockSession(transaction, sessionId);
    if (current.status === 'APPROVED') {
      return loadSessionView(transaction, sessionId);
    }
    if (current.status !== 'PENDING_APPROVAL') {
      throw new InventoryCountError('INVENTORY_COUNT_INVALID_STATE');
    }

    const lines = await transaction.inventoryCountLine.findMany({
      orderBy: [{ productId: 'asc' }, { warehouseId: 'asc' }],
      select: {
        difference: true,
        expectedQuantity: true,
        id: true,
        productId: true,
        warehouseId: true,
      },
      where: { sessionId },
    });
    if (lines.length === 0) {
      throw new InventoryCountError('INVENTORY_COUNT_REQUIRES_LINES');
    }
    const adjustable = lines.filter(
      (line) => scaled(line.difference.toString()) !== 0n,
    );

    const approvedAt = this.clock.now();
    const adjustments: InventoryCountAdjustmentAuditEntry[] = [];

    if (adjustable.length > 0) {
      // A line counted where no balance row existed yet expects zero;
      // materialize it at zero so the adjustment has a row to move, exactly as
      // a transfer does for an absent destination.
      for (const line of adjustable) {
        await transaction.$executeRaw`
          INSERT INTO inventory_balances
            (id, product_id, warehouse_id, quantity, created_at, updated_at)
          VALUES
            (${randomUUID()}::uuid, ${line.productId}::uuid,
             ${line.warehouseId}::uuid, 0, now(), now())
          ON CONFLICT (product_id, warehouse_id) DO NOTHING
        `;
      }

      // Lock every affected balance in one statement, in the same global order
      // used by sales and transfers, so a concurrent operation on the same
      // pairs queues instead of deadlocking.
      const productIds = [
        ...new Set(adjustable.map((l) => l.productId)),
      ].sort();
      const warehouseIds = [
        ...new Set(adjustable.map((l) => l.warehouseId)),
      ].sort();
      const locked = await transaction.$queryRaw<LockedBalance[]>`
        SELECT product_id, warehouse_id, quantity::text AS quantity
        FROM inventory_balances
        WHERE product_id = ANY(${productIds}::uuid[])
          AND warehouse_id = ANY(${warehouseIds}::uuid[])
        ORDER BY product_id, warehouse_id
        FOR UPDATE
      `;
      const currentQuantity = new Map(
        locked.map((row) => [
          `${row.product_id}:${row.warehouse_id}`,
          row.quantity,
        ]),
      );

      // The schema only checks the adjustment against the stored difference,
      // never against the live balance. If stock moved since the count, the
      // counted quantity is no longer ground truth, so the whole approval is
      // refused rather than silently landing on a different number.
      for (const line of adjustable) {
        const observed = currentQuantity.get(
          `${line.productId}:${line.warehouseId}`,
        );
        if (
          observed === undefined ||
          scaled(observed) !== scaled(line.expectedQuantity.toString())
        ) {
          throw new InventoryCountError('INVENTORY_COUNT_BALANCE_CHANGED');
        }
      }

      for (const line of adjustable) {
        const difference = line.difference.toString();
        let movementId: string;
        try {
          const result = await this.adjustments.adjustInTransaction(
            transaction,
            actorUserId,
            {
              productId: line.productId,
              quantityDelta: difference,
              reason: `Ajuste por conteo fisico de la sesion ${sessionId}`,
              warehouseId: line.warehouseId,
            },
          );
          movementId = result.movementId;
        } catch (error) {
          translateAdjustmentError(error);
        }
        // The only update a captured line ever receives.
        await transaction.inventoryCountLine.update({
          data: { adjustmentMovementId: movementId },
          where: { id: line.id },
        });
        adjustments.push({
          difference,
          lineId: line.id,
          movementId,
          productId: line.productId,
          warehouseId: line.warehouseId,
        });
      }
    }

    await transaction.inventoryCountSession.update({
      data: { approvedAt, approvedByUserId: actorUserId, status: 'APPROVED' },
      where: { id: sessionId },
    });

    const view = await loadSessionView(transaction, sessionId);
    await this.audit.recordSessionApproved(transaction, {
      actorUserId,
      adjustments,
      occurredAt: approvedAt,
      pendingItemCount: view.pendingItems.length,
      sessionId,
      unchangedLineCount: lines.length - adjustable.length,
    });

    return view;
  }

  private async cancelInTransaction(
    transaction: TransactionClient,
    actorUserId: string,
    sessionId: string,
    reason: string,
  ): Promise<InventoryCountSessionView> {
    await this.assertActive(transaction, actorUserId);

    const current = await this.lockSession(transaction, sessionId);
    if (current.status === 'CANCELLED') {
      return loadSessionView(transaction, sessionId);
    }
    if (current.status === 'APPROVED') {
      throw new InventoryCountError('INVENTORY_COUNT_INVALID_STATE');
    }

    // Whoever can run counts may abandon one; an approver may also stop a
    // session waiting on them, which is how a count is rejected — the schema
    // has no REJECTED state, cancellation is the only terminal stop.
    const canCreate = await this.permissions.hasPermissionUsing(
      transaction,
      actorUserId,
      'inventory.audit.create',
    );
    const canApprove =
      current.status === 'PENDING_APPROVAL' &&
      (await this.permissions.hasPermissionUsing(
        transaction,
        actorUserId,
        'inventory.audit.approve',
      ));
    if (!canCreate && !canApprove) {
      throw new InventoryCountError('INVENTORY_COUNT_PERMISSION_DENIED');
    }

    const cancelledAt = this.clock.now();
    await transaction.inventoryCountSession.update({
      data: {
        cancellationReason: reason,
        cancelledAt,
        cancelledByUserId: actorUserId,
        status: 'CANCELLED',
      },
      where: { id: sessionId },
    });
    await this.audit.recordSessionCancelled(transaction, {
      actorUserId,
      occurredAt: cancelledAt,
      previousStatus: current.status,
      reason,
      sessionId,
    });

    return loadSessionView(transaction, sessionId);
  }
}
