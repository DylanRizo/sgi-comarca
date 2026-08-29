import type {
  DailyClosingStatus,
  DailyClosingView,
  FinanceLineSource,
  FinancialEntryType,
} from '@sgi/contracts';

export function entryTypeLabel(type: FinancialEntryType): string {
  return type === 'INCOME' ? 'Ingreso' : 'Gasto';
}

export function lineSourceLabel(source: FinanceLineSource): string {
  return source === 'SALE' ? 'Venta' : 'Manual';
}

export function closingStatusLabel(status: DailyClosingStatus): string {
  return status === 'REOPENED' ? 'Reabierto' : 'Cerrado';
}

export function closingStatusTone(
  status: DailyClosingStatus,
): 'neutral' | 'transit' {
  return status === 'REOPENED' ? 'transit' : 'neutral';
}

/**
 * A closing may only be reopened while it is CLOSED. The backend re-validates
 * this, including the reopening window and permission; hiding the control is
 * presentation, not authorization.
 */
export function canReopen(closing: DailyClosingView): boolean {
  return closing.status === 'CLOSED';
}

/** Render a civil `YYYY-MM-DD` business date without a timezone shift. */
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
