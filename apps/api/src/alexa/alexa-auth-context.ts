import type { Request } from 'express';

export type AlexaAuthenticatedContext = {
  linkId: string;
  scopes: readonly string[];
  tokenId: string;
  userId: string;
};

const alexaContextKey = Symbol('alexa-authenticated-request-context');

export type AlexaAuthenticatedRequest = Request & {
  [alexaContextKey]?: AlexaAuthenticatedContext;
};

export function attachAlexaAuthenticatedContext(
  request: AlexaAuthenticatedRequest,
  context: AlexaAuthenticatedContext,
): void {
  Object.defineProperty(request, alexaContextKey, {
    configurable: false,
    enumerable: false,
    value: Object.freeze({
      ...context,
      scopes: Object.freeze([...context.scopes]),
    }),
    writable: false,
  });
}

export function alexaAuthenticatedContext(
  request: AlexaAuthenticatedRequest,
): AlexaAuthenticatedContext | undefined {
  return request[alexaContextKey];
}
