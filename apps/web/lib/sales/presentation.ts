import type { SaleOrigin, SalePaymentStatus, SaleStatus } from '@sgi/contracts';

/**
 * Presentation helpers for the sales read surface.
 *
 * Two rules are structural rather than cosmetic:
 *
 * - fulfillment (`status`) and payment (`paymentStatus`) are always rendered as
 *   two independent states. A sale in transit may already be paid, and a
 *   completed sale may still be pending;
 * - cost and margin are never derived or displayed. `sales.read` grants no
 *   financial permission (ADR-009, AGENTS.md), and the API never emits
 *   `unitCostSnapshot`, so nothing here may reconstruct it.
 */

const managua = 'America/Managua';

export type SaleTone = 'neutral' | 'positive' | 'warning';

export function saleStatusLabel(status: SaleStatus): string {
  if (status === 'IN_TRANSIT') return 'En tránsito';
  if (status === 'COMPLETED') return 'Entregada';
  if (status === 'CANCELLED') return 'Cancelada';
  return 'Sin estado registrado';
}

export function saleStatusTone(status: SaleStatus): SaleTone {
  if (status === 'COMPLETED') return 'positive';
  if (status === 'CANCELLED') return 'warning';
  return 'neutral';
}

export function salePaymentStatusLabel(status: SalePaymentStatus): string {
  if (status === 'PAID') return 'Pagada';
  if (status === 'PENDING') return 'Pendiente de pago';
  return 'Pago sin registrar';
}

export function salePaymentStatusTone(status: SalePaymentStatus): SaleTone {
  if (status === 'PAID') return 'positive';
  if (status === 'PENDING') return 'warning';
  return 'neutral';
}

export function saleOriginLabel(origin: SaleOrigin): string {
  return origin === 'OPERATIONAL' ? 'Operativa' : 'Importada del legacy';
}

/**
 * Render a civil business date (`YYYY-MM-DD`).
 *
 * The value is a calendar date, not an instant. `new Date('2026-01-01')`
 * parses as UTC midnight, so formatting it in the viewer's zone shifts it
 * backwards anywhere west of UTC: in Managua (UTC-6) it would read
 * `31 dic 2025`. Formatting in UTC keeps the civil date the business recorded.
 */
export function formatBusinessDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('es-NI', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(parsed);
}

/**
 * Render a stored instant in `America/Managua`, the operational zone required
 * by AGENTS.md. Unlike a business date, these are real points in time.
 */
export function formatSaleInstant(value: string | null): string {
  if (!value) return 'Sin registrar';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('es-NI', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: managua,
  }).format(parsed);
}

export function formatSaleMoney(
  value: string | null,
  currencyCode: string,
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

/**
 * Quantity is emitted as persisted, so `3`, `2.5`, and `2.5000` are the same
 * value. Parse by value and normalize only for display.
 */
export function formatSaleQuantity(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return new Intl.NumberFormat('es-NI', {
    maximumFractionDigits: 4,
  }).format(numeric);
}

/** Distinct warehouses touched by a sale, in first-appearance order. */
export function saleWarehouseCodes(
  items: readonly { warehouse: { code: string } }[],
): readonly string[] {
  return [...new Set(items.map((item) => item.warehouse.code))];
}
