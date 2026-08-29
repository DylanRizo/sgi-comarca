import type {
  CreateDailyClosingRequest,
  CreateFinancialEntryRequest,
} from '@sgi/contracts';
import { createHash } from 'node:crypto';

import { centsToMoney, moneyToCents } from '../common/money.js';
import { FinanceError } from './finance.errors.js';

const businessDatePattern = /^\d{4}-\d{2}-\d{2}$/u;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export const idempotencyKeyPattern = /^[\x21-\x7e]{16,128}$/u;

function canonicalUuid(value: unknown, failure: FinanceError): string {
  if (typeof value !== 'string') throw failure;
  const normalized = value.toLowerCase();
  if (!uuidPattern.test(normalized)) throw failure;
  return normalized;
}

function canonicalDate(value: unknown, failure: FinanceError): string {
  if (typeof value !== 'string' || !businessDatePattern.test(value)) {
    throw failure;
  }
  return value;
}

function canonicalMoney(value: unknown, failure: FinanceError): string {
  if (typeof value !== 'string') throw failure;
  const cents = moneyToCents(value);
  if (cents === null) throw failure;
  return centsToMoney(cents);
}

/** Optional free text is trimmed; an empty result is persisted as absent. */
function canonicalText(value: unknown, failure: FinanceError): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw failure;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 500) throw failure;
  return trimmed;
}

/**
 * Canonical form of a manual financial entry, used for the actor-scoped
 * idempotency request hash. Only validated business inputs take part: the
 * actor, the key, timestamps and generated ids are excluded, exactly as in the
 * sales module.
 */
export function canonicalFinancialEntryRequest(
  input: CreateFinancialEntryRequest,
): string {
  const invalid = new FinanceError('FINANCE_REQUEST_INVALID');
  if (input.entryType !== 'INCOME' && input.entryType !== 'EXPENSE') {
    throw invalid;
  }
  const amount = canonicalMoney(input.amount, invalid);
  // A financial entry must move money; zero is rejected before the CHECK.
  if (moneyToCents(amount) === 0n) throw invalid;

  return JSON.stringify({
    amount,
    businessDate: canonicalDate(input.businessDate, invalid),
    categoryId: canonicalUuid(input.categoryId, invalid),
    description: canonicalText(input.description, invalid),
    entryType: input.entryType,
    responsibleUserId: canonicalUuid(input.responsibleUserId, invalid),
  });
}

/**
 * Canonical form of a daily closing. The counted amounts and the business date
 * are the intent; the system sales figure and the tolerance are resolved by
 * the server and therefore excluded from the hash.
 */
export function canonicalDailyClosingRequest(
  input: CreateDailyClosingRequest,
): string {
  const invalid = new FinanceError('CLOSING_REQUEST_INVALID');
  return JSON.stringify({
    businessDate: canonicalDate(input.businessDate, invalid),
    observations: canonicalText(input.observations, invalid),
    realCash: canonicalMoney(input.realCash, invalid),
    realDigital: canonicalMoney(input.realDigital, invalid),
  });
}

/** Canonical form of a closing reopening: the target and its reason. */
export function canonicalReopeningRequest(
  closingId: string,
  reason: string,
): string {
  const invalid = new FinanceError('CLOSING_REQUEST_INVALID');
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmed || trimmed.length > 500) throw invalid;
  return JSON.stringify({
    closingId: canonicalUuid(closingId, invalid),
    reason: trimmed,
  });
}

/** Lowercase SHA-256 of any canonical request or idempotency key. */
export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
