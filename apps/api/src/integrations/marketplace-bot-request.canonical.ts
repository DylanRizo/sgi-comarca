import type { MarketplaceBotCommandPayload } from '@sgi/contracts';
import { createHash } from 'node:crypto';

/** Same shape every idempotent mutation of the API accepts. */
export const botIdempotencyKeyPattern = /^[\x21-\x7e]{16,128}$/u;

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = sortKeys(record[key]);
  }
  return sorted;
}

/**
 * Stable text for "this command, for this instance". Two requests are the
 * same intent only when this text matches, whatever order the keys came in.
 */
export function canonicalBotCommandRequest(
  instanceId: string,
  payload: MarketplaceBotCommandPayload,
): string {
  return JSON.stringify(
    sortKeys({ instanceId: instanceId.toLowerCase(), payload }),
  );
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
