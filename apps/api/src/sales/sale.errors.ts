import type { SaleErrorDetail, SalesPublicErrorCode } from '@sgi/contracts';

/**
 * Domain failure codes for the sales application layer. The public subset is
 * re-exported by `@sgi/contracts` as `SalesPublicErrorCode`; both unions must
 * stay in sync, mirroring the inventory-transfer pattern.
 */
export type SaleFailure = SalesPublicErrorCode;

export class SaleError extends Error {
  /**
   * The product+warehouse pair that caused the failure, when the throw site
   * knows it. Only the balance/price/cost 422s surface it publicly (FASE 7B
   * plan §13); `mapSaleError` decides which codes may expose it.
   */
  readonly detail: SaleErrorDetail | null;

  constructor(
    readonly code: SaleFailure,
    detail: SaleErrorDetail | null = null,
  ) {
    super(code);
    this.name = 'SaleError';
    this.detail = detail;
  }
}
