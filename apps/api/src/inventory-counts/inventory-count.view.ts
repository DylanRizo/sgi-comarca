import type {
  InventoryCountPendingItem,
  InventoryCountSessionStatus,
  InventoryCountSessionSummary,
  InventoryCountSessionView,
} from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';

import { InventoryCountError } from './inventory-count.errors.js';

type TransactionClient = Omit<
  DatabaseClient,
  '$connect' | '$disconnect' | '$extends' | '$on' | '$transaction'
>;

const actorSelect = { displayName: true, id: true };
const productSelect = { code: true, id: true, name: true };
const warehouseSelect = { active: true, code: true, id: true, name: true };

export const sessionSelect = {
  approvedAt: true,
  approvedBy: { select: actorSelect },
  businessDate: true,
  cancellationReason: true,
  cancelledAt: true,
  cancelledBy: { select: actorSelect },
  createdAt: true,
  createdBy: { select: actorSelect },
  id: true,
  lines: {
    orderBy: [{ productId: 'asc' as const }, { warehouseId: 'asc' as const }],
    select: {
      adjustmentMovementId: true,
      countedAt: true,
      countedQuantity: true,
      difference: true,
      expectedQuantity: true,
      id: true,
      product: { select: productSelect },
      warehouse: { select: warehouseSelect },
    },
  },
  reason: true,
  status: true,
  submittedAt: true,
  warehouses: {
    orderBy: { warehouseId: 'asc' as const },
    select: { warehouse: { select: warehouseSelect } },
  },
};

export type SessionRecord = {
  approvedAt: Date | null;
  approvedBy: { displayName: string; id: string } | null;
  businessDate: Date;
  cancellationReason: string | null;
  cancelledAt: Date | null;
  cancelledBy: { displayName: string; id: string } | null;
  createdAt: Date;
  createdBy: { displayName: string; id: string };
  id: string;
  lines: {
    adjustmentMovementId: string | null;
    countedAt: Date;
    countedQuantity: { toString(): string };
    difference: { toString(): string };
    expectedQuantity: { toString(): string };
    id: string;
    product: { active?: boolean; code: string; id: string; name: string };
    warehouse: { active: boolean; code: string; id: string; name: string };
  }[];
  reason: string;
  status: string;
  submittedAt: Date | null;
  warehouses: {
    warehouse: { active: boolean; code: string; id: string; name: string };
  }[];
};

/** A business date is stored as a DATE, so only its civil day is meaningful. */
function businessDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function mapSession(
  record: SessionRecord,
  pendingItems: InventoryCountPendingItem[],
): InventoryCountSessionView {
  return {
    approvedAt: record.approvedAt?.toISOString() ?? null,
    approvedBy: record.approvedBy,
    businessDate: businessDateString(record.businessDate),
    cancellationReason: record.cancellationReason,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    cancelledBy: record.cancelledBy,
    createdAt: record.createdAt.toISOString(),
    createdBy: record.createdBy,
    id: record.id,
    lines: record.lines.map((line) => ({
      adjustmentMovementId: line.adjustmentMovementId,
      countedAt: line.countedAt.toISOString(),
      countedQuantity: line.countedQuantity.toString(),
      difference: line.difference.toString(),
      expectedQuantity: line.expectedQuantity.toString(),
      id: line.id,
      product: {
        code: line.product.code,
        id: line.product.id,
        name: line.product.name,
      },
      warehouse: line.warehouse,
    })),
    pendingItems,
    reason: record.reason,
    status: record.status as InventoryCountSessionStatus,
    submittedAt: record.submittedAt?.toISOString() ?? null,
    warehouses: record.warehouses.map(({ warehouse }) => warehouse),
  };
}

export function mapSessionSummary(
  record: SessionRecord & { lineCount: number },
): InventoryCountSessionSummary {
  return {
    businessDate: businessDateString(record.businessDate),
    createdAt: record.createdAt.toISOString(),
    createdBy: record.createdBy,
    id: record.id,
    lineCount: record.lineCount,
    reason: record.reason,
    status: record.status as InventoryCountSessionStatus,
    warehouses: record.warehouses.map(({ warehouse }) => warehouse),
  };
}

type PendingRow = {
  expected_quantity: string;
  product_code: string;
  product_id: string;
  product_name: string;
  warehouse_active: boolean;
  warehouse_code: string;
  warehouse_id: string;
  warehouse_name: string;
};

/**
 * Every product holding a balance inside the declared scope that this session
 * never counted. AT-AUD-02 requires reporting these as pending: a missing count
 * preserves the balance and never becomes a zero-quantity adjustment.
 */
export async function loadPendingItems(
  transaction: TransactionClient,
  sessionId: string,
  warehouseIds: string[],
): Promise<InventoryCountPendingItem[]> {
  if (warehouseIds.length === 0) return [];
  const rows = await transaction.$queryRaw<PendingRow[]>`
    SELECT
      balance.quantity::text AS expected_quantity,
      product.code AS product_code,
      product.id AS product_id,
      product.name AS product_name,
      warehouse.active AS warehouse_active,
      warehouse.code AS warehouse_code,
      warehouse.id AS warehouse_id,
      warehouse.name AS warehouse_name
    FROM inventory_balances AS balance
    JOIN products AS product ON product.id = balance.product_id
    JOIN warehouses AS warehouse ON warehouse.id = balance.warehouse_id
    WHERE
      balance.warehouse_id = ANY(${warehouseIds}::uuid[])
      AND NOT EXISTS (
        SELECT 1
        FROM inventory_count_lines AS line
        WHERE
          line.session_id = ${sessionId}::uuid
          AND line.product_id = balance.product_id
          AND line.warehouse_id = balance.warehouse_id
      )
    ORDER BY product.code, warehouse.code
  `;
  return rows.map((row) => ({
    expectedQuantity: row.expected_quantity,
    product: {
      code: row.product_code,
      id: row.product_id,
      name: row.product_name,
    },
    warehouse: {
      active: row.warehouse_active,
      code: row.warehouse_code,
      id: row.warehouse_id,
      name: row.warehouse_name,
    },
  }));
}

export async function loadSessionView(
  transaction: TransactionClient,
  sessionId: string,
): Promise<InventoryCountSessionView> {
  const record = (await transaction.inventoryCountSession.findUnique({
    select: sessionSelect,
    where: { id: sessionId },
  })) as SessionRecord | null;
  if (!record) {
    throw new InventoryCountError('INVENTORY_COUNT_SESSION_NOT_FOUND');
  }
  const pendingItems = await loadPendingItems(
    transaction,
    sessionId,
    record.warehouses.map(({ warehouse }) => warehouse.id),
  );
  return mapSession(record, pendingItems);
}
