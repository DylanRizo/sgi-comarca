export type IntegrationKeyErrorCode =
  | 'ACCESS_DENIED'
  | 'INTEGRATION_DISABLED'
  | 'INVALID_KEY'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'RATE_LIMITED';

export class IntegrationKeyError extends Error {
  constructor(readonly code: IntegrationKeyErrorCode) {
    super(`Integration key request failed: ${code}.`);
    this.name = 'IntegrationKeyError';
  }
}
