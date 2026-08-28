import type { SalePaymentStatus, SaleStatus, SaleView } from '@sgi/contracts';

/** Spanish label for the persisted fulfillment status. */
export function saleStatusLabel(status: SaleStatus): string {
  if (status === 'IN_TRANSIT') return 'En tránsito';
  if (status === 'COMPLETED') return 'Completada';
  if (status === 'CANCELLED') return 'Cancelada';
  return 'Sin clasificar';
}

/** Fulfillment and payment are separate concerns; never conflate them. */
export function paymentStatusLabel(status: SalePaymentStatus): string {
  if (status === 'PENDING') return 'Pendiente';
  if (status === 'PAID') return 'Pagada';
  return 'Sin registrar';
}

export function saleStatusTone(
  status: SaleStatus,
): 'cancelled' | 'completed' | 'neutral' | 'transit' {
  if (status === 'IN_TRANSIT') return 'transit';
  if (status === 'COMPLETED') return 'completed';
  if (status === 'CANCELLED') return 'cancelled';
  return 'neutral';
}

/**
 * A sale is confirmable only while it is in transit and unpaid. The backend
 * re-validates this; hiding the control is presentation, not authorization.
 */
export function canConfirm(sale: SaleView): boolean {
  return sale.status === 'IN_TRANSIT' && sale.paymentStatus === 'PENDING';
}

/** Cancellation is total and only for an eligible in-transit, unpaid sale. */
export function canCancel(sale: SaleView): boolean {
  return sale.status === 'IN_TRANSIT' && sale.paymentStatus === 'PENDING';
}

/**
 * Render a civil `YYYY-MM-DD` business date without a timezone shift.
 *
 * The value is a calendar date, not an instant: it is built at UTC midnight
 * and must be formatted in UTC too. Formatting it in the viewer's local zone
 * would move it a day back west of Greenwich — in Managua, `2026-01-01` would
 * read as 31 dic 2025.
 */
export function formatBusinessDate(value: string): string {
  const parts = value.split('-');
  if (parts.length !== 3) return value;
  const [year, month, day] = parts.map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('es-NI', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** Distinct warehouses touched by a sale, for the list summary. */
export function saleWarehouseNames(sale: SaleView): readonly string[] {
  return [...new Set(sale.items.map((item) => item.warehouse.name))];
}
