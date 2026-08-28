import type { SalesPublicErrorCode } from '@sgi/contracts';

/**
 * Domain failure codes for the sales application layer. The public subset is
 * re-exported by `@sgi/contracts` as `SalesPublicErrorCode`; both unions must
 * stay in sync, mirroring the inventory-transfer pattern.
 */
export type SaleFailure = SalesPublicErrorCode;

export class SaleError extends Error {
  constructor(readonly code: SaleFailure) {
    super(code);
    this.name = 'SaleError';
  }
}
