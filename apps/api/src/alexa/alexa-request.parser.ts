import type {
  AlexaIntent,
  AlexaRequestEnvelope,
  AlexaSlot,
} from '@sgi/alexa-adapter';

import { AlexaOAuthError } from './alexa-oauth.errors.js';

const requestTypes = new Set([
  'IntentRequest',
  'LaunchRequest',
  'SessionEndedRequest',
]);
const slotNames = new Set(['bodega', 'numeroVenta', 'producto']);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedString(
  value: unknown,
  maximum: number,
  required = false,
): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string') throw new AlexaOAuthError('INVALID_REQUEST');
  const trimmed = value.trim();
  if ((required && !trimmed) || trimmed.length > maximum) {
    throw new AlexaOAuthError('INVALID_REQUEST');
  }
  return trimmed || undefined;
}

function sanitizeSlots(value: unknown): Record<string, AlexaSlot> {
  const source = record(value);
  if (!source) return {};
  const slots: Record<string, AlexaSlot> = {};
  for (const [name, candidate] of Object.entries(source)) {
    if (!slotNames.has(name)) continue;
    const sourceSlot = record(candidate);
    if (!sourceSlot) throw new AlexaOAuthError('INVALID_REQUEST');
    const spoken = boundedString(sourceSlot.value, 200);
    slots[name] = { name, ...(spoken ? { value: spoken } : {}) };
  }
  return slots;
}

function sanitizeIntent(value: unknown): AlexaIntent {
  const source = record(value);
  if (!source) throw new AlexaOAuthError('INVALID_REQUEST');
  return {
    confirmationStatus: boundedString(source.confirmationStatus, 32) ?? 'NONE',
    name: boundedString(source.name, 120, true)!,
    slots: sanitizeSlots(source.slots),
  };
}

export function sanitizeAlexaEnvelope(value: unknown): AlexaRequestEnvelope {
  const envelope = record(value);
  const sourceRequest = record(envelope?.request);
  if (!envelope || !sourceRequest) {
    throw new AlexaOAuthError('INVALID_REQUEST');
  }
  const type = boundedString(sourceRequest.type, 40, true)!;
  if (!requestTypes.has(type)) throw new AlexaOAuthError('INVALID_REQUEST');
  const locale = boundedString(sourceRequest.locale, 16);
  if (locale && locale !== 'es-MX') {
    throw new AlexaOAuthError('INVALID_REQUEST');
  }
  const requestId = boundedString(sourceRequest.requestId, 256);
  const intent =
    type === 'IntentRequest' ? sanitizeIntent(sourceRequest.intent) : undefined;
  return {
    request: {
      ...(intent ? { intent } : {}),
      ...(locale ? { locale } : {}),
      ...(requestId ? { requestId } : {}),
      type,
    },
    version: '1.0',
  };
}
