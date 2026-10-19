import type { DatabaseClient } from '@sgi/database';

import {
  inventoryDecimalString,
  inventoryScaledInteger,
} from '../inventory/inventory-quantity.js';
import type { SaleLineAuditEntry } from './sale-audit.service.js';
import { SaleError } from './sale.errors.js';

export type SaleTransaction = Omit<
  DatabaseClient,
  '$connect' | '$disconnect' | '$extends' | '$on' | '$transaction'
>;

/** Called after the immutable cancellation document, inside the sale lock. */
export async function restoreSaleInventory(
  transaction: SaleTransaction,
  actorUserId: string,
  saleId: string,
  occurredAt: Date,
): Promise<SaleLineAuditEntry[]> {
  const items = await transaction.saleItem.findMany({
    orderBy: [{ productId: 'asc' }, { warehouseId: 'asc' }],
    select: { id: true, productId: true, quantity: true, warehouseId: true },
    where: { saleId },
  });
  if (!items.length) throw new SaleError('SALE_CONCURRENCY_CONFLICT');
  const productIds = [...new Set(items.map((item) => item.productId))].sort();
  const warehouseIds = [
    ...new Set(items.map((item) => item.warehouseId)),
  ].sort();
  // Same global lock order as sale creation. Do not hold a balance while
  // waiting for product/warehouse rows needed by the ledger foreign keys.
  const products = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM products WHERE id = ANY(${productIds}::uuid[]) ORDER BY id FOR UPDATE
  `;
  const warehouses = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM warehouses WHERE id = ANY(${warehouseIds}::uuid[]) ORDER BY id FOR UPDATE
  `;
  if (
    products.length !== productIds.length ||
    warehouses.length !== warehouseIds.length
  ) {
    throw new SaleError('SALE_CONCURRENCY_CONFLICT');
  }
  const rows = await transaction.$queryRaw<
    Array<{
      id: string;
      product_id: string;
      warehouse_id: string;
      quantity: string;
    }>
  >`
    SELECT id,product_id,warehouse_id,quantity::text AS quantity FROM inventory_balances
    WHERE product_id = ANY(${productIds}::uuid[]) AND warehouse_id = ANY(${warehouseIds}::uuid[])
    ORDER BY product_id,warehouse_id FOR UPDATE
  `;
  const balances = new Map(
    rows.map((row) => [`${row.product_id}:${row.warehouse_id}`, row]),
  );
  const running = new Map<string, bigint>();
  for (const item of items) {
    const key = `${item.productId}:${item.warehouseId}`;
    const row = balances.get(key);
    const value = row ? inventoryScaledInteger(row.quantity) : null;
    if (value === null) throw new SaleError('SALE_CONCURRENCY_CONFLICT');
    running.set(key, value);
  }
  const lines: SaleLineAuditEntry[] = [];
  for (const item of items) {
    const key = `${item.productId}:${item.warehouseId}`;
    const before = running.get(key);
    const quantity = inventoryScaledInteger(item.quantity.toString());
    if (before === undefined || quantity === null)
      throw new SaleError('SALE_CONCURRENCY_CONFLICT');
    const after = before + quantity;
    running.set(key, after);
    const movement = await transaction.inventoryMovement.create({
      data: {
        actorUserId,
        balanceAfter: inventoryDecimalString(after),
        balanceBefore: inventoryDecimalString(before),
        occurredAt,
        productId: item.productId,
        quantityDelta: inventoryDecimalString(quantity),
        saleItemId: item.id,
        sourceId: saleId,
        sourceType: 'SALE_CANCELLATION',
        type: 'SALE_CANCELLATION',
        warehouseId: item.warehouseId,
      },
      select: { id: true },
    });
    lines.push({
      balanceAfter: inventoryDecimalString(after),
      balanceBefore: inventoryDecimalString(before),
      movementId: movement.id,
      productId: item.productId,
      quantity: inventoryDecimalString(quantity),
      saleItemId: item.id,
      warehouseId: item.warehouseId,
    });
  }
  for (const [key, quantity] of running) {
    const balance = balances.get(key);
    if (!balance) throw new SaleError('SALE_CONCURRENCY_CONFLICT');
    await transaction.inventoryBalance.update({
      data: {
        quantity: inventoryDecimalString(quantity),
        version: { increment: 1 },
      },
      where: { id: balance.id },
    });
  }
  return lines;
}
