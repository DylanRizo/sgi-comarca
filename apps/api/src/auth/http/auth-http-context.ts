import type { Request } from 'express';

export type AuthenticatedRequestContext = {
  absoluteExpiresAt: Date;
  idleExpiresAt: Date;
  sessionId: string;
  userId: string;
};

const contextKey = Symbol('authenticated-request-context');

export type AuthenticatedRequest = Request & {
  [contextKey]?: AuthenticatedRequestContext;
};

export function attachAuthenticatedContext(
  request: AuthenticatedRequest,
  context: AuthenticatedRequestContext,
): void {
  Object.defineProperty(request, contextKey, {
    configurable: false,
    enumerable: false,
    value: Object.freeze(context),
    writable: false,
  });
}

export function authenticatedContext(
  request: AuthenticatedRequest,
): AuthenticatedRequestContext | undefined {
  return request[contextKey];
}
