import type {
  ProductInventoryView,
  ProductWarehouseValuationView,
} from '@sgi/contracts';

interface DecimalValue {
  toFixed(): string;
  toString(): string;
}

interface UnitRecord {
  active: boolean;
  code: string;
  id: string;
  name: string;
}

interface WarehouseRecord {
  active: boolean;
  code: string;
  id: string;
  name: string;
}

interface BalanceRecord {
  costReviewRequired: boolean;
  currentUnitCost: DecimalValue | null;
  currentUnitPrice: DecimalValue | null;
  id: string;
  priceReviewRequired: boolean;
  quantity: DecimalValue;
  warehouse: WarehouseRecord;
  warehouseId: string;
}

interface ValuationRecord {
  currencyCode: string;
  effectiveAt: Date | null;
  id: string;
  observedAt: Date;
  requiresHumanReview: boolean;
  unitCost: DecimalValue | null;
  unitPrice: DecimalValue | null;
  warehouseId: string;
}

export interface InventoryProductRecord {
  active: boolean;
  code: string;
  createdAt: Date;
  description: string | null;
  id: string;
  inventoryBalances: readonly BalanceRecord[];
  minimumStock: DecimalValue;
  name: string;
  productWarehouseValuations: readonly ValuationRecord[];
  unit: UnitRecord | null;
  updatedAt: Date;
}

function decimal(value: DecimalValue | null): string | null {
  return value === null ? null : value.toString();
}

export function sumDecimalValues(values: readonly DecimalValue[]): string {
  if (values.length === 0) return '0';
  const source = values.map((value) => value.toFixed());
  const parsed = source.map((value) => {
    const match = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(value);
    if (!match) throw new Error('Unexpected decimal representation.');
    return {
      negative: match[1] === '-',
      integer: match[2]!,
      fraction: match[3] ?? '',
    };
  });
  const scale = Math.max(...parsed.map((value) => value.fraction.length));
  const total = parsed.reduce((sum, value) => {
    const digits = BigInt(value.integer + value.fraction.padEnd(scale, '0'));
    return sum + (value.negative ? -digits : digits);
  }, 0n);
  const negative = total < 0n;
  const absolute = (negative ? -total : total)
    .toString()
    .padStart(scale + 1, '0');
  if (scale === 0) return `${negative ? '-' : ''}${absolute}`;
  const integer = absolute.slice(0, -scale);
  const fraction = absolute.slice(-scale).replace(/0+$/u, '');
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

function mapValuation(
  valuation: ValuationRecord,
): ProductWarehouseValuationView {
  return {
    currencyCode: valuation.currencyCode,
    effectiveAt: valuation.effectiveAt?.toISOString() ?? null,
    id: valuation.id,
    observedAt: valuation.observedAt.toISOString(),
    requiresHumanReview: valuation.requiresHumanReview,
    unitCost: decimal(valuation.unitCost),
    unitPrice: decimal(valuation.unitPrice),
  };
}

export function mapProductInventory(
  product: InventoryProductRecord,
): ProductInventoryView {
  const valuationsByWarehouse = new Map<
    string,
    ProductWarehouseValuationView[]
  >();
  for (const valuation of product.productWarehouseValuations) {
    const values = valuationsByWarehouse.get(valuation.warehouseId) ?? [];
    values.push(mapValuation(valuation));
    valuationsByWarehouse.set(valuation.warehouseId, values);
  }

  return {
    balances: product.inventoryBalances.map((balance) => ({
      costReviewRequired: balance.costReviewRequired,
      currentUnitCost: decimal(balance.currentUnitCost),
      currentUnitPrice: decimal(balance.currentUnitPrice),
      id: balance.id,
      priceReviewRequired: balance.priceReviewRequired,
      quantity: balance.quantity.toString(),
      valuations: valuationsByWarehouse.get(balance.warehouseId) ?? [],
      warehouse: {
        active: balance.warehouse.active,
        code: balance.warehouse.code,
        id: balance.warehouse.id,
        name: balance.warehouse.name,
      },
    })),
    product: {
      active: product.active,
      code: product.code,
      createdAt: product.createdAt.toISOString(),
      description: product.description,
      id: product.id,
      minimumStock: product.minimumStock.toString(),
      name: product.name,
      unit: product.unit
        ? {
            active: product.unit.active,
            code: product.unit.code,
            id: product.unit.id,
            name: product.unit.name,
          }
        : null,
      updatedAt: product.updatedAt.toISOString(),
    },
    totalQuantity: sumDecimalValues(
      product.inventoryBalances.map((balance) => balance.quantity),
    ),
  };
}
