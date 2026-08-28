import type { SaleView } from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';
import { createHash } from 'node:crypto';

import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import {
  inventoryDecimalString,
  inventoryScaledInteger,
} from '../inventory/inventory-quantity.js';
import {
  SaleAuditService,
  type SaleLineAuditEntry,
} from './sale-audit.service.js';
import { mapSale, type SaleRecord } from './sale-read.mapper.js';
import { SaleError } from './sale.errors.js';

type TransactionClient = Omit<
  DatabaseClient,
  '$connect' | '$disconnect' | '$extends' | '$on' | '$transaction'
>;

const idempotencyKeyPattern = /^[\x21-\x7e]{16,128}$/u;

export type SaleClock = { now(): Date };
const systemClock: SaleClock = { now: () => new Date() };

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function transactionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('code' in error && ['P2002', 'P2034'].includes(String(error.code))) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return ['40001', '40P01', '55P03'].some((code) => message.includes(code));
}

const saleSelect = {
  businessDate: true,
  completedAt: true,
  createdAt: true,
  currencyCode: true,
  departureAt: true,
  id: true,
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      lineSubtotal: true,
      product: { select: { code: true, id: true, name: true } },
      quantity: true,
      shippingAllocation: true,
      unitPriceSnapshot: true,
      warehouse: {
        select: { active: true, code: true, id: true, name: true },
      },
    },
  },
  origin: true,
  paymentStatus: true,
  saleNumber: true,
  sellerUserId: true,
  shippingAmount: true,
  status: true,
  subtotal: true,
  total: true,
};

/**
 * In-transit confirmation and total cancellation (plan §10 and §11).
 *
 * Both flows insert their document before the status UPDATE, because
 * `guard_sale_write()` requires the document to authorize the transition.
 * Confirmation never touches inventory or payment; cancellation restores each
 * original balance exactly once and appends one coherent SALE_CANCELLATION
 * per line.
 */
export class SaleLifecycleService {
  private readonly permissions: EffectivePermissionsService;

  constructor(
    private readonly client: DatabaseClient,
    private readonly audit: SaleAuditService = new SaleAuditService(),
    private readonly clock: SaleClock = systemClock,
  ) {
    this.permissions = new EffectivePermissionsService(client);
  }

  async confirmInTransit(
    actorUserId: string,
    saleId: string,
    idempotencyKey: string | undefined,
  ): Promise<SaleView> {
    const hashes = this.hashes(idempotencyKey, JSON.stringify({ saleId }));
    return this.run((transaction) =>
      this.confirmInTransaction(transaction, actorUserId, saleId, hashes),
    );
  }

  async cancel(
    actorUserId: string,
    saleId: string,
    rawReason: string,
    idempotencyKey: string | undefined,
  ): Promise<SaleView> {
    const reason = rawReason?.trim() ?? '';
    if (!reason || reason.length > 500) {
      throw new SaleError('SALES_REQUEST_INVALID');
    }
    const hashes = this.hashes(
      idempotencyKey,
      JSON.stringify({ reason, saleId }),
    );
    return this.run((transaction) =>
      this.cancelInTransaction(
        transaction,
        actorUserId,
        saleId,
        reason,
        hashes,
      ),
    );
  }

  private hashes(
    idempotencyKey: string | undefined,
    canonical: string,
  ): { idempotencyKeyHash: string; requestHash: string } {
    if (idempotencyKey === undefined) {
      throw new SaleError('IDEMPOTENCY_KEY_REQUIRED');
    }
    if (!idempotencyKeyPattern.test(idempotencyKey)) {
      throw new SaleError('IDEMPOTENCY_KEY_INVALID');
    }
    return {
      idempotencyKeyHash: sha256(idempotencyKey),
      requestHash: sha256(canonical),
    };
  }

  private async run(
    operation: (transaction: TransactionClient) => Promise<SaleView>,
  ): Promise<SaleView> {
    try {
      return await this.client.$transaction(operation, {
        isolationLevel: 'ReadCommitted',
        timeout: 15_000,
      });
    } catch (error) {
      if (error instanceof SaleError) throw error;
      if (transactionConflict(error)) {
        throw new SaleError('SALE_CONCURRENCY_CONFLICT');
      }
      throw error;
    }
  }

  private async authorize(
    transaction: TransactionClient,
    actorUserId: string,
    permission: string,
  ): Promise<void> {
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
        permission,
      ))
    ) {
      throw new SaleError('SALES_PERMISSION_DENIED');
    }
  }

  /** Serialize concurrent lifecycle work on the same sale. */
  private async lockSale(
    transaction: TransactionClient,
    saleId: string,
  ): Promise<{ status: string; paymentStatus: string }> {
    const rows = await transaction.$queryRaw<
      { status: string; payment_status: string }[]
    >`
      SELECT status::text AS status, payment_status::text AS payment_status
      FROM sales
      WHERE id = ${saleId}::uuid
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new SaleError('SALE_NOT_FOUND');
    return { paymentStatus: row.payment_status, status: row.status };
  }

  private async confirmInTransaction(
    transaction: TransactionClient,
    actorUserId: string,
    saleId: string,
    hashes: { idempotencyKeyHash: string; requestHash: string },
  ): Promise<SaleView> {
    await this.authorize(transaction, actorUserId, 'sales.confirm_in_transit');

    const scope = `sales.confirm:${actorUserId}:${hashes.idempotencyKeyHash}`;
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))
    `;
    const claimed = await transaction.inTransitConfirmation.findUnique({
      select: { requestHash: true, saleId: true },
      where: {
        confirmedByUserId_idempotencyKeyHash: {
          confirmedByUserId: actorUserId,
          idempotencyKeyHash: hashes.idempotencyKeyHash,
        },
      },
    });
    if (claimed) {
      if (claimed.requestHash !== hashes.requestHash) {
        throw new SaleError('IDEMPOTENCY_KEY_REUSED');
      }
      return mapSale(await this.loadSale(transaction, claimed.saleId));
    }

    const current = await this.lockSale(transaction, saleId);
    // A new key over an already-terminal sale must not create a second
    // document: return the terminal result when a coherent one exists.
    const existing = await transaction.inTransitConfirmation.findUnique({
      select: { id: true },
      where: { saleId },
    });
    if (existing) {
      return mapSale(await this.loadSale(transaction, saleId));
    }
    if (
      current.status !== 'IN_TRANSIT' ||
      current.paymentStatus !== 'PENDING'
    ) {
      throw new SaleError('SALE_INVALID_STATE');
    }

    const confirmedAt = this.clock.now();
    const confirmation = await transaction.inTransitConfirmation.create({
      data: {
        confirmedAt,
        confirmedByUserId: actorUserId,
        idempotencyKeyHash: hashes.idempotencyKeyHash,
        requestHash: hashes.requestHash,
        saleId,
      },
      select: { id: true },
    });
    // completed_at must equal confirmed_at exactly (guard_sale_write).
    await transaction.sale.update({
      data: { completedAt: confirmedAt, status: 'COMPLETED' },
      where: { id: saleId },
    });
    await this.audit.recordConfirmed(transaction, {
      actorUserId,
      confirmationId: confirmation.id,
      newStatus: 'COMPLETED',
      occurredAt: confirmedAt,
      previousStatus: 'IN_TRANSIT',
      saleId,
    });

    return mapSale(await this.loadSale(transaction, saleId));
  }

  private async cancelInTransaction(
    transaction: TransactionClient,
    actorUserId: string,
    saleId: string,
    reason: string,
    hashes: { idempotencyKeyHash: string; requestHash: string },
  ): Promise<SaleView> {
    await this.authorize(transaction, actorUserId, 'sales.cancel');

    const scope = `sales.cancel:${actorUserId}:${hashes.idempotencyKeyHash}`;
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))
    `;
    const claimed = await transaction.saleCancellation.findUnique({
      select: { requestHash: true, saleId: true },
      where: {
        cancelledByUserId_idempotencyKeyHash: {
          cancelledByUserId: actorUserId,
          idempotencyKeyHash: hashes.idempotencyKeyHash,
        },
      },
    });
    if (claimed) {
      if (claimed.requestHash !== hashes.requestHash) {
        throw new SaleError('IDEMPOTENCY_KEY_REUSED');
      }
      return mapSale(await this.loadSale(transaction, claimed.saleId));
    }

    const current = await this.lockSale(transaction, saleId);
    const existing = await transaction.saleCancellation.findUnique({
      select: { id: true },
      where: { saleId },
    });
    if (existing) {
      return mapSale(await this.loadSale(transaction, saleId));
    }
    if (
      current.status !== 'IN_TRANSIT' ||
      current.paymentStatus !== 'PENDING'
    ) {
      throw new SaleError('SALE_INVALID_STATE');
    }

    const items = await transaction.saleItem.findMany({
      orderBy: [{ productId: 'asc' }, { warehouseId: 'asc' }],
      select: {
        id: true,
        productId: true,
        quantity: true,
        warehouseId: true,
      },
      where: { saleId },
    });
    if (items.length === 0) throw new SaleError('SALE_CONCURRENCY_CONFLICT');

    // Lock the original balances in the same global order used on creation.
    const productIds = [...new Set(items.map((item) => item.productId))].sort();
    const warehouseIds = [
      ...new Set(items.map((item) => item.warehouseId)),
    ].sort();
    const balanceRows = await transaction.$queryRaw<
      {
        id: string;
        product_id: string;
        warehouse_id: string;
        quantity: string;
      }[]
    >`
      SELECT id, product_id, warehouse_id, quantity::text AS quantity
      FROM inventory_balances
      WHERE product_id = ANY(${productIds}::uuid[])
        AND warehouse_id = ANY(${warehouseIds}::uuid[])
      ORDER BY product_id, warehouse_id
      FOR UPDATE
    `;
    const balances = new Map(
      balanceRows.map((row) => [`${row.product_id}:${row.warehouse_id}`, row]),
    );
    // Validate every balance is present before writing anything. A missing
    // row is an integrity conflict; a balance is never invented to hide it.
    const running = new Map<string, bigint>();
    for (const item of items) {
      const key = `${item.productId}:${item.warehouseId}`;
      const row = balances.get(key);
      if (!row) throw new SaleError('SALE_CONCURRENCY_CONFLICT');
      if (!running.has(key)) {
        const value = inventoryScaledInteger(row.quantity);
        if (value === null) throw new SaleError('SALE_CONCURRENCY_CONFLICT');
        running.set(key, value);
      }
    }

    const cancelledAt = this.clock.now();
    const cancellation = await transaction.saleCancellation.create({
      data: {
        cancelledAt,
        cancelledByUserId: actorUserId,
        idempotencyKeyHash: hashes.idempotencyKeyHash,
        reason,
        requestHash: hashes.requestHash,
        saleId,
      },
      select: { id: true },
    });

    const auditLines: SaleLineAuditEntry[] = [];
    for (const item of items) {
      const key = `${item.productId}:${item.warehouseId}`;
      const before = running.get(key);
      if (before === undefined) {
        throw new SaleError('SALE_CONCURRENCY_CONFLICT');
      }
      const quantityScaled = inventoryScaledInteger(item.quantity.toString());
      if (quantityScaled === null) {
        throw new SaleError('SALE_CONCURRENCY_CONFLICT');
      }
      const after = before + quantityScaled;
      running.set(key, after);

      const movement = await transaction.inventoryMovement.create({
        data: {
          actorUserId,
          balanceAfter: inventoryDecimalString(after),
          balanceBefore: inventoryDecimalString(before),
          occurredAt: cancelledAt,
          productId: item.productId,
          quantityDelta: inventoryDecimalString(quantityScaled),
          saleItemId: item.id,
          sourceId: saleId,
          sourceType: 'SALE_CANCELLATION',
          type: 'SALE_CANCELLATION',
          warehouseId: item.warehouseId,
        },
        select: { id: true },
      });
      auditLines.push({
        balanceAfter: inventoryDecimalString(after),
        balanceBefore: inventoryDecimalString(before),
        movementId: movement.id,
        productId: item.productId,
        quantity: inventoryDecimalString(quantityScaled),
        saleItemId: item.id,
        warehouseId: item.warehouseId,
      });
    }

    for (const [key, finalQuantity] of running) {
      const row = balances.get(key);
      if (!row) throw new SaleError('SALE_CONCURRENCY_CONFLICT');
      await transaction.inventoryBalance.update({
        data: {
          quantity: inventoryDecimalString(finalQuantity),
          version: { increment: 1 },
        },
        where: { id: row.id },
      });
    }

    // Payment stays PENDING and completed_at stays null (guard_sale_write).
    await transaction.sale.update({
      data: { completedAt: null, status: 'CANCELLED' },
      where: { id: saleId },
    });
    await this.audit.recordCancelled(transaction, {
      actorUserId,
      cancellationId: cancellation.id,
      lines: auditLines,
      occurredAt: cancelledAt,
      reason,
      saleId,
    });

    return mapSale(await this.loadSale(transaction, saleId));
  }

  private async loadSale(
    transaction: TransactionClient,
    id: string,
  ): Promise<SaleRecord> {
    const sale = await transaction.sale.findUnique({
      select: saleSelect,
      where: { id },
    });
    if (!sale) throw new SaleError('SALE_NOT_FOUND');
    return sale;
  }
}
