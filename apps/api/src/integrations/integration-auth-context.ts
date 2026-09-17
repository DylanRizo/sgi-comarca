import type { Request } from 'express';

import type { ValidIntegrationKey } from './integration-key.service.js';

const contextKey = Symbol('integration-key-context');

export type IntegrationAuthenticatedRequest = Request & {
  [contextKey]?: ValidIntegrationKey;
};

export function attachIntegrationContext(
  request: IntegrationAuthenticatedRequest,
  context: ValidIntegrationKey,
): void {
  Object.defineProperty(request, contextKey, {
    configurable: false,
    enumerable: false,
    value: Object.freeze({
      ...context,
      scopes: Object.freeze([...context.scopes]),
    }),
    writable: false,
  });
}

export function integrationContext(
  request: IntegrationAuthenticatedRequest,
): ValidIntegrationKey | undefined {
  return request[contextKey];
}
