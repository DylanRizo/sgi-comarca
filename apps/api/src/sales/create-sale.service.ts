import type { CreateSaleRequest, SaleView } from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';
import { createHash } from 'node:crypto';

import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import {
  inventoryDecimalString,
  inventoryScaledInteger,
  maximumScaledInventoryQuantity,
} from '../inventory/inventory-quantity.js';
import { createSaleRequestHash } from './create-sale-request.canonical.js';
import {
  SaleAuditService,
  type SaleLineAuditEntry,
  type SalePriceOverrideAuditEntry,
  type SaleReviewFlagAuditEntry,
} from './sale-audit.service.js';
import {
  centsToMoney,
  lineSubtotalCents,
  moneyToCents,
  sumCents,
} from './sale-money.js';
import { resolveLinePricing } from './sale-pricing.js';
import { mapSale, type SaleRecord } from './sale-read.mapper.js';
import { saleSelect } from './sale-select.js';
import { allocateShipping } from './sale-shipping-allocation.js';
import { SaleError } from './sale.errors.js';

type TransactionClient = Omit<
  DatabaseClient,
  '$connect' | '$disconnect' | '$extends' | '$on' | '$transaction'
>;

const idempotencyKeyPattern = /^[\x21-\x7e]{16,128}$/u;

export type SaleClock = { now(): Date };
const systemClock: SaleClock = { now: () => new Date() };

interface LockedBalanceRow {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: string;
  current_unit_price: string | null;
  current_unit_cost: string | null;
  price_review_required: boolean;
  cost_review_required: boolean;
}

interface NormalizedLine {
  ordinal: number;
  productId: string;
  warehouseId: string;
  quantityScaled: bigint;
  unitPriceOverride: string | null;
}

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

function pairKey(productId: string, warehouseId: string): string {
  return `${productId}:${warehouseId}`;
}

/**
 * Store free text exactly as the idempotency hash saw it: trimmed, with blank
 * collapsed to null. If these diverged, a replay of the same intent would
 * persist a different value than the one its hash was computed from.
 */
function operationalText(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export class CreateSaleService {
  private readonly permissions: EffectivePermissionsService;

  constructor(
    private readonly client: DatabaseClient,
    private readonly audit: SaleAuditService = new SaleAuditService(),
    private readonly clock: SaleClock = systemClock,
  ) {
    this.permissions = new EffectivePermissionsService(client);
  }

  async create(
    actorUserId: string,
    idempotencyKey: string | undefined,
    input: CreateSaleRequest,
  ): Promise<SaleView> {
    if (idempotencyKey === undefined) {
      throw new SaleError('IDEMPOTENCY_KEY_REQUIRED');
    }
    if (!idempotencyKeyPattern.test(idempotencyKey)) {
      throw new SaleError('IDEMPOTENCY_KEY_INVALID');
    }
    // Canonicalization also validates shape, scale, and ordering.
    const requestHash = createSaleRequestHash(input);
    const idempotencyKeyHash = sha256(idempotencyKey);

    try {
      return await this.client.$transaction(
        (transaction) =>
          this.createInTransaction(transaction, actorUserId, input, {
            idempotencyKeyHash,
            requestHash,
          }),
        { isolationLevel: 'ReadCommitted', timeout: 15_000 },
      );
    } catch (error) {
      if (error instanceof SaleError) throw error;
      if (transactionConflict(error)) {
        throw new SaleError('SALE_CONCURRENCY_CONFLICT');
      }
      throw error;
    }
  }

  private async createInTransaction(
    transaction: TransactionClient,
    actorUserId: string,
    input: CreateSaleRequest,
    hashes: { idempotencyKeyHash: string; requestHash: string },
  ): Promise<SaleView> {
    // 1. Revalidate the actor and the effective permission inside the
    //    transaction; a role grant can be revoked concurrently.
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
        'sales.create',
      ))
    ) {
      throw new SaleError('SALES_PERMISSION_DENIED');
    }

    // 2. Claim the idempotency scope before touching stock.
    const scope = `sales.create:${actorUserId}:${hashes.idempotencyKeyHash}`;
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))
    `;
    const replay = await this.findReplay(
      transaction,
      actorUserId,
      hashes.idempotencyKeyHash,
    );
    if (replay) {
      if (replay.requestHash !== hashes.requestHash) {
        throw new SaleError('IDEMPOTENCY_KEY_REUSED');
      }
      return mapSale(replay.sale);
    }

    // 3. Normalize lines, preserving the validated ordinal as the semantic
    //    order used for shipping allocation and ledger chaining.
    const lines: NormalizedLine[] = input.items.map((item, index) => {
      const quantityScaled = inventoryScaledInteger(item.quantity);
      if (
        quantityScaled === null ||
        quantityScaled <= 0n ||
        quantityScaled > maximumScaledInventoryQuantity
      ) {
        throw new SaleError('SALES_REQUEST_INVALID');
      }
      return {
        ordinal: index,
        productId: item.productId.toLowerCase(),
        quantityScaled,
        unitPriceOverride: item.unitPrice ?? null,
        warehouseId: item.warehouseId.toLowerCase(),
      };
    });

    const sellerUserId = input.sellerUserId?.toLowerCase() ?? null;
    if (sellerUserId) {
      const seller = await transaction.user.findUnique({
        select: { activatedAt: true, status: true },
        where: { id: sellerUserId },
      });
      if (!seller || seller.status !== 'ACTIVE' || !seller.activatedAt) {
        throw new SaleError('SALES_REQUEST_INVALID');
      }
    }

    // 4. Lock products, then warehouses, then balances, each in a
    //    deterministic global order (transaction-design.md).
    const productIds = [...new Set(lines.map((line) => line.productId))].sort();
    const warehouseIds = [
      ...new Set(lines.map((line) => line.warehouseId)),
    ].sort();

    const products = await transaction.$queryRaw<
      { id: string; code: string; name: string }[]
    >`
      SELECT id, code, name
      FROM products
      WHERE id = ANY(${productIds}::uuid[]) AND active = true
      ORDER BY id
      FOR UPDATE
    `;
    if (products.length !== productIds.length) {
      throw new SaleError('SALE_PRODUCT_UNAVAILABLE');
    }
    const warehouses = await transaction.$queryRaw<
      { id: string; code: string; name: string; active: boolean }[]
    >`
      SELECT id, code, name, active
      FROM warehouses
      WHERE id = ANY(${warehouseIds}::uuid[]) AND active = true
      ORDER BY id
      FOR UPDATE
    `;
    if (warehouses.length !== warehouseIds.length) {
      throw new SaleError('SALE_WAREHOUSE_UNAVAILABLE');
    }

    const balanceRows = await transaction.$queryRaw<LockedBalanceRow[]>`
      SELECT
        id,
        product_id,
        warehouse_id,
        quantity::text AS quantity,
        current_unit_price::text AS current_unit_price,
        current_unit_cost::text AS current_unit_cost,
        price_review_required,
        cost_review_required
      FROM inventory_balances
      WHERE product_id = ANY(${productIds}::uuid[])
        AND warehouse_id = ANY(${warehouseIds}::uuid[])
      ORDER BY product_id, warehouse_id
      FOR UPDATE
    `;
    const balances = new Map(
      balanceRows.map((row) => [
        pairKey(row.product_id, row.warehouse_id),
        row,
      ]),
    );

    // 5. Validate every line before the first write. A sale never creates a
    //    missing balance; it rejects the whole request.
    const aggregated = new Map<string, bigint>();
    for (const line of lines) {
      const key = pairKey(line.productId, line.warehouseId);
      if (!balances.has(key)) {
        throw new SaleError('SALE_BALANCE_NOT_FOUND');
      }
      aggregated.set(key, (aggregated.get(key) ?? 0n) + line.quantityScaled);
    }
    const remaining = new Map<string, bigint>();
    for (const [key, required] of aggregated) {
      const row = balances.get(key);
      if (!row) throw new SaleError('SALE_BALANCE_NOT_FOUND');
      const available = inventoryScaledInteger(row.quantity);
      if (available === null) throw new SaleError('SALE_CONCURRENCY_CONFLICT');
      if (available < required) {
        throw new SaleError('SALE_INSUFFICIENT_STOCK');
      }
      remaining.set(key, available);
    }

    // 6. Resolve price/cost from the locked rows and compute canonical money.
    const priceOverrides: SalePriceOverrideAuditEntry[] = [];
    const reviewFlags: SaleReviewFlagAuditEntry[] = [];
    const priced = lines.map((line) => {
      const row = balances.get(pairKey(line.productId, line.warehouseId));
      if (!row) throw new SaleError('SALE_BALANCE_NOT_FOUND');
      const pricing = resolveLinePricing(
        {
          costReviewRequired: row.cost_review_required,
          currentUnitCost: row.current_unit_cost,
          currentUnitPrice: row.current_unit_price,
          priceReviewRequired: row.price_review_required,
        },
        line.unitPriceOverride,
      );
      const subtotal = lineSubtotalCents(
        inventoryDecimalString(line.quantityScaled),
        pricing.unitPriceSnapshot,
      );
      if (subtotal === null) throw new SaleError('SALES_REQUEST_INVALID');
      if (pricing.priceOverridden) {
        priceOverrides.push({
          appliedUnitPrice: pricing.unitPriceSnapshot,
          productId: line.productId,
          referenceUnitPrice: pricing.referenceUnitPrice,
          warehouseId: line.warehouseId,
        });
      }
      if (pricing.priceReviewRequired || pricing.costReviewRequired) {
        reviewFlags.push({
          costReviewRequired: pricing.costReviewRequired,
          priceReviewRequired: pricing.priceReviewRequired,
          productId: line.productId,
          warehouseId: line.warehouseId,
        });
      }
      return { ...line, pricing, subtotalCents: subtotal };
    });

    const subtotalCents = sumCents(priced.map((line) => line.subtotalCents));
    if (subtotalCents === null) throw new SaleError('SALES_REQUEST_INVALID');
    const shippingCents = moneyToCents(input.shippingAmount ?? '0');
    if (shippingCents === null) throw new SaleError('SALES_REQUEST_INVALID');
    const allocations = allocateShipping(shippingCents, priced.length);
    const totalCents = subtotalCents + shippingCents;

    // 7. Write: header, items, balance updates, one SALE per line, one audit.
    const occurredAt = this.clock.now();
    const sale = await transaction.sale.create({
      data: {
        businessDate: new Date(`${input.businessDate}T00:00:00.000Z`),
        completedAt: input.status === 'COMPLETED' ? occurredAt : null,
        createdByUserId: actorUserId,
        currencyCode: 'NIO',
        // The caller may state when the order actually left; otherwise the
        // write instant stands, which is what this service did before.
        departureAt: input.departureAt
          ? new Date(input.departureAt)
          : occurredAt,
        delivererText: operationalText(input.delivererText),
        deliveryPlace: operationalText(input.deliveryPlace),
        idempotencyKeyHash: hashes.idempotencyKeyHash,
        observations: operationalText(input.observations),
        origin: 'OPERATIONAL',
        paymentMethodText: operationalText(input.paymentMethodText),
        paymentStatus: 'PENDING',
        requestHash: hashes.requestHash,
        salesChannelText: operationalText(input.salesChannelText),
        sellerUserId,
        shippingAmount: centsToMoney(shippingCents),
        status: input.status,
        subtotal: centsToMoney(subtotalCents),
        total: centsToMoney(totalCents),
      },
      select: { id: true, saleNumber: true },
    });

    const auditLines: SaleLineAuditEntry[] = [];
    for (const line of priced) {
      const key = pairKey(line.productId, line.warehouseId);
      const balanceRow = balances.get(key);
      const before = remaining.get(key);
      if (!balanceRow || before === undefined) {
        throw new SaleError('SALE_CONCURRENCY_CONFLICT');
      }
      const after = before - line.quantityScaled;
      if (after < 0n) throw new SaleError('SALE_INSUFFICIENT_STOCK');
      remaining.set(key, after);

      const quantity = inventoryDecimalString(line.quantityScaled);
      const allocation = allocations[line.ordinal] ?? 0n;
      const item = await transaction.saleItem.create({
        data: {
          lineSubtotal: centsToMoney(line.subtotalCents),
          productId: line.productId,
          quantity,
          saleId: sale.id,
          shippingAllocation: centsToMoney(allocation),
          unitCostSnapshot: line.pricing.unitCostSnapshot,
          unitPriceSnapshot: line.pricing.unitPriceSnapshot,
          warehouseId: line.warehouseId,
        },
        select: { id: true },
      });
      const movement = await transaction.inventoryMovement.create({
        data: {
          actorUserId,
          balanceAfter: inventoryDecimalString(after),
          balanceBefore: inventoryDecimalString(before),
          occurredAt,
          productId: line.productId,
          quantityDelta: inventoryDecimalString(-line.quantityScaled),
          saleItemId: item.id,
          sourceId: sale.id,
          sourceType: 'SALE',
          type: 'SALE',
          warehouseId: line.warehouseId,
        },
        select: { id: true },
      });
      auditLines.push({
        balanceAfter: inventoryDecimalString(after),
        balanceBefore: inventoryDecimalString(before),
        movementId: movement.id,
        productId: line.productId,
        quantity,
        saleItemId: item.id,
        warehouseId: line.warehouseId,
      });
    }

    // Persist each affected balance once, at its final value.
    for (const [key, finalQuantity] of remaining) {
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

    await this.audit.recordCreated(transaction, {
      actorUserId,
      lines: auditLines,
      occurredAt,
      priceOverrides,
      reviewFlags,
      saleId: sale.id,
      saleNumber: sale.saleNumber,
      sellerUserId,
      shippingAmount: centsToMoney(shippingCents),
      status: input.status,
      subtotal: centsToMoney(subtotalCents),
      total: centsToMoney(totalCents),
    });

    const created = await this.loadSale(transaction, sale.id);
    return mapSale(created);
  }

  private async findReplay(
    transaction: TransactionClient,
    actorUserId: string,
    idempotencyKeyHash: string,
  ): Promise<{ requestHash: string | null; sale: SaleRecord } | null> {
    const existing = await transaction.sale.findUnique({
      select: { id: true, requestHash: true },
      where: {
        createdByUserId_idempotencyKeyHash: {
          createdByUserId: actorUserId,
          idempotencyKeyHash,
        },
      },
    });
    if (!existing) return null;
    return {
      requestHash: existing.requestHash,
      sale: await this.loadSale(transaction, existing.id),
    };
  }

  private async loadSale(
    transaction: TransactionClient,
    id: string,
  ): Promise<SaleRecord> {
    const sale = await transaction.sale.findUnique({
      select: saleSelect,
      where: { id },
    });
    if (!sale) throw new SaleError('SALE_CONCURRENCY_CONFLICT');
    return sale;
  }
}
