import type { FinancesPublicErrorCode } from '@sgi/contracts';

/**
 * Domain failure codes for finances and daily closings. The public subset is
 * re-exported by `@sgi/contracts`; both unions must stay in sync, mirroring
 * the sales module.
 */
export type FinanceFailure = FinancesPublicErrorCode;

export class FinanceError extends Error {
  constructor(readonly code: FinanceFailure) {
    super(code);
    this.name = 'FinanceError';
  }
}
