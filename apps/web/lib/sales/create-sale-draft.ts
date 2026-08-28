import type { CreateSaleRequest, SaleCreationStatus } from '@sgi/contracts';

export interface SaleDraftLine {
  productId: string;
  quantity: string;
  unitPrice: string;
  warehouseId: string;
}

export interface SaleDraft {
  businessDate: string;
  lines: readonly SaleDraftLine[];
  shippingAmount: string;
  status: SaleCreationStatus;
}

export type SaleDraftIssue =
  | 'BUSINESS_DATE_INVALID'
  | 'INSUFFICIENT_STOCK'
  | 'NO_LINES'
  | 'PRICE_INVALID'
  | 'QUANTITY_INVALID'
  | 'SHIPPING_INVALID'
  | 'WAREHOUSE_MISSING';

export type SaleDraftPreview =
  | {
      kind: 'invalid';
      issue: SaleDraftIssue;
      /** Ordinal of the offending line, when the issue belongs to one. */
      lineIndex: number | null;
    }
  | {
      kind: 'valid';
      request: CreateSaleRequest;
      /**
       * Informational client-side total. The server recalculates every amount
       * and its result is authoritative; this only helps the operator.
       */
      estimatedSubtotal: string;
      estimatedTotal: string;
    };

const quantityPattern = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/u;
const moneyPattern = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/u;
const businessDatePattern = /^\d{4}-\d{2}-\d{2}$/u;

function quantityToScaled(value: string): bigint | null {
  if (!quantityPattern.test(value)) return null;
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(`${whole}${fraction.padEnd(4, '0')}`);
}

function moneyToCents(value: string): bigint | null {
  if (!moneyPattern.test(value)) return null;
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(`${whole}${fraction.padEnd(2, '0')}`);
}

function centsToMoney(cents: bigint): string {
  const padded = cents.toString().padStart(3, '0');
  return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
}

function invalid(
  issue: SaleDraftIssue,
  lineIndex: number | null = null,
): SaleDraftPreview {
  return { issue, kind: 'invalid', lineIndex };
}

/**
 * Validate a sale draft and build the request the API expects.
 *
 * `availableByPair` maps `productId:warehouseId` to the on-hand quantity, so
 * repeated lines on the same pair are checked against their aggregate. This is
 * an early, friendly check only: the server locks the balances and re-validates
 * stock, price and cost, and its decision is the one that counts.
 *
 * The reference price per pair, when known, feeds the informational estimate.
 * The client never sends subtotals, totals or cost.
 */
export function previewSaleDraft(
  draft: SaleDraft,
  availableByPair: ReadonlyMap<string, string>,
  referencePriceByPair: ReadonlyMap<string, string | null>,
): SaleDraftPreview {
  if (!businessDatePattern.test(draft.businessDate)) {
    return invalid('BUSINESS_DATE_INVALID');
  }
  if (draft.lines.length === 0) return invalid('NO_LINES');

  const shippingCents = moneyToCents(draft.shippingAmount || '0');
  if (shippingCents === null) return invalid('SHIPPING_INVALID');

  const requiredByPair = new Map<string, bigint>();
  const items: CreateSaleRequest['items'] = [];
  let subtotalCents = 0n;

  for (const [index, line] of draft.lines.entries()) {
    if (!line.productId || !line.warehouseId) {
      return invalid('WAREHOUSE_MISSING', index);
    }
    const scaled = quantityToScaled(line.quantity);
    if (scaled === null || scaled <= 0n) {
      return invalid('QUANTITY_INVALID', index);
    }

    const override = line.unitPrice.trim();
    let priceCents: bigint | null = null;
    if (override) {
      priceCents = moneyToCents(override);
      if (priceCents === null) return invalid('PRICE_INVALID', index);
    }

    const pair = `${line.productId}:${line.warehouseId}`;
    requiredByPair.set(pair, (requiredByPair.get(pair) ?? 0n) + scaled);

    const reference = referencePriceByPair.get(pair) ?? null;
    const effectiveCents =
      priceCents ?? (reference === null ? null : moneyToCents(reference));
    if (effectiveCents !== null) {
      // quantity is scaled by 10^4 and price by 10^2; round half up to cents.
      subtotalCents += (scaled * effectiveCents + 5000n) / 10000n;
    }

    items.push({
      productId: line.productId,
      quantity: line.quantity,
      warehouseId: line.warehouseId,
      ...(override ? { unitPrice: override } : {}),
    });
  }

  for (const [pair, required] of requiredByPair) {
    const available = quantityToScaled(availableByPair.get(pair) ?? '0');
    if (available === null || available < required) {
      const lineIndex = draft.lines.findIndex(
        (line) => `${line.productId}:${line.warehouseId}` === pair,
      );
      return invalid('INSUFFICIENT_STOCK', lineIndex === -1 ? null : lineIndex);
    }
  }

  return {
    estimatedSubtotal: centsToMoney(subtotalCents),
    estimatedTotal: centsToMoney(subtotalCents + shippingCents),
    kind: 'valid',
    request: {
      businessDate: draft.businessDate,
      items,
      status: draft.status,
      ...(shippingCents > 0n ? { shippingAmount: draft.shippingAmount } : {}),
    },
  };
}

export function saleDraftIssueMessage(issue: SaleDraftIssue): string {
  if (issue === 'BUSINESS_DATE_INVALID') return 'Selecciona una fecha válida.';
  if (issue === 'NO_LINES') return 'Agrega al menos una línea.';
  if (issue === 'WAREHOUSE_MISSING') {
    return 'Cada línea necesita producto y almacén.';
  }
  if (issue === 'QUANTITY_INVALID') {
    return 'Ingresa una cantidad mayor que cero, con máximo 4 decimales.';
  }
  if (issue === 'PRICE_INVALID') {
    return 'El precio debe ser un monto no negativo con máximo 2 decimales.';
  }
  if (issue === 'SHIPPING_INVALID') {
    return 'El envío debe ser un monto no negativo con máximo 2 decimales.';
  }
  return 'La cantidad supera el stock disponible en ese almacén.';
}
