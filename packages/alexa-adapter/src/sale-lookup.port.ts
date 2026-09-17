import type { SaleStatus } from '@sgi/contracts';

/** Deliberately excludes money, payment, contact and free-text delivery data. */
export interface VoiceSaleItem {
  product: {
    code: string;
    name: string;
  };
  quantity: string;
  warehouse?: {
    code: string;
    name: string;
  };
}

/** Minimum operational projection that is safe to render on a shared Echo. */
export interface VoiceSaleSummary {
  businessDate: string;
  items: readonly VoiceSaleItem[];
  saleNumber: string;
  status: SaleStatus;
}

export interface VoiceSaleList {
  items: readonly VoiceSaleSummary[];
  total: number;
}

/**
 * Read-only sales boundary for Alexa.
 *
 * A production implementation must project an authorized SGI sale read model
 * into VoiceSaleSummary before returning it. Returning SaleView would expose
 * fields that this shared-device surface must never receive.
 */
export interface SaleLookupPort {
  listSalesInTransit(): Promise<VoiceSaleList>;
  searchSalesByNumber(query: string): Promise<readonly VoiceSaleSummary[]>;
}

export type SaleNumberResolution =
  | { kind: 'found'; value: VoiceSaleSummary }
  | { kind: 'ambiguous'; values: readonly VoiceSaleSummary[] }
  | { kind: 'not_found' };

export function normalizeSaleNumber(value: string): string {
  const digits = value.replace(/\D/gu, '');
  if (digits.length > 0 && digits.length <= 9) {
    return `VTA-${digits.padStart(9, '0')}`;
  }
  return value.toLocaleUpperCase('es-MX').replace(/[^A-Z0-9]/gu, '');
}

export function resolveSaleNumber(
  spokenValue: string,
  candidates: readonly VoiceSaleSummary[],
): SaleNumberResolution {
  const normalized = normalizeSaleNumber(spokenValue);
  const exact = candidates.filter(
    (candidate) => normalizeSaleNumber(candidate.saleNumber) === normalized,
  );
  if (exact.length === 1) return { kind: 'found', value: exact[0]! };
  if (exact.length > 1) return { kind: 'ambiguous', values: exact };
  if (candidates.length === 1) return { kind: 'found', value: candidates[0]! };
  if (candidates.length > 1) {
    return { kind: 'ambiguous', values: candidates };
  }
  return { kind: 'not_found' };
}
