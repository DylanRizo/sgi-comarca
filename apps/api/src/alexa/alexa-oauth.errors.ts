export type AlexaOAuthFailure =
  | 'ACCESS_DENIED'
  | 'INTEGRATION_DISABLED'
  | 'INVALID_CLIENT'
  | 'INVALID_GRANT'
  | 'INVALID_REQUEST'
  | 'RATE_LIMITED';

export class AlexaOAuthError extends Error {
  constructor(readonly code: AlexaOAuthFailure) {
    super(code);
    this.name = 'AlexaOAuthError';
  }
}
