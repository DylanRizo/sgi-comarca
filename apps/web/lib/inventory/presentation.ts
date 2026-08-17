import type {
  InventoryBalanceView,
  ProductInventoryView,
  ProductSummary,
  ProductWarehouseValuationView,
} from '@sgi/contracts';

export interface ProductTableRow {
  active: boolean;
  code: string;
  id: string;
  name: string;
  totalQuantity: string;
  unitName: string;
  warehousesWithStock: number;
}

export function productRows(
  products: readonly ProductSummary[],
  inventories: readonly ProductInventoryView[],
): readonly ProductTableRow[] {
  const byProduct = new Map(
    inventories.map((inventory) => [inventory.product.id, inventory]),
  );
  return products.map((product) => {
    const inventory = byProduct.get(product.id);
    return {
      active: product.active,
      code: product.code,
      id: product.id,
      name: product.name,
      totalQuantity: inventory?.totalQuantity ?? '0',
      unitName: product.unit?.name ?? 'Sin unidad',
      warehousesWithStock:
        inventory?.balances.filter((balance) => Number(balance.quantity) > 0)
          .length ?? 0,
    };
  });
}

export function latestValuation(
  balance: InventoryBalanceView,
): ProductWarehouseValuationView | null {
  return balance.valuations[0] ?? null;
}

export function formatQuantity(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return new Intl.NumberFormat('es-NI', {
    maximumFractionDigits: 4,
  }).format(numeric);
}

export function formatMoney(
  value: string | null,
  currencyCode = 'NIO',
): string {
  if (value === null) return 'No disponible';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return new Intl.NumberFormat('es-NI', {
    currency: currencyCode,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(numeric);
}

export function formatObservedAt(value: string | null): string {
  if (!value) return 'Sin fecha observada';
  return new Intl.DateTimeFormat('es-NI', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
