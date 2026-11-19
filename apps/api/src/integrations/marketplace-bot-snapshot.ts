import {
  isValidMarketplaceBotLocalDateTime,
  marketplaceBotClockPattern,
  marketplaceBotListingActions,
  marketplaceBotQueueActions,
  marketplaceBotSafetyLevels,
  marketplaceBotScheduleLimits,
  type MarketplaceBotAccountSnapshot,
  type MarketplaceBotAlert,
  type MarketplaceBotCommandPayload,
  type MarketplaceBotLeadProduct,
  type MarketplaceBotListing,
  type MarketplaceBotListingAction,
  type MarketplaceBotQueueAction,
  type MarketplaceBotQueueItem,
  type MarketplaceBotSafetyLevel,
  type MarketplaceBotSchedule,
  type MarketplaceBotScheduleRules,
  type MarketplaceBotSnapshot,
  type MarketplaceBotUnansweredLead,
} from '@sgi/contracts';

import { IntegrationKeyError } from './integration-key.errors.js';

const MAX_ACCOUNTS = 12;
const MAX_ALERTS = 50;
const MAX_LISTINGS = 80;
const MAX_PRODUCTS = 50;
const MAX_QUEUE_ITEMS = 80;
const MAX_UNANSWERED = 50;
const MAX_APPROVE_IDS = 100;
const safeCodePattern = /^[A-Za-z0-9._:-]{1,80}$/u;
// Account names are the ones configured on the bot computer ("Dylan Steven"):
// letters with accents and inner spaces are valid; the bot checks they exist.
const accountNamePattern =
  /^(?=.{1,64}$)[\p{L}\p{N}_.:-](?:[\p{L}\p{N}_ .:-]*[\p{L}\p{N}_.:-])?$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength: number, fallback = ''): string {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  return String(value).trim().slice(0, maxLength) || fallback;
}

function cleanNullableText(value: unknown, maxLength: number): string | null {
  const cleaned = cleanText(value, maxLength, '');
  return cleaned.length > 0 ? cleaned : null;
}

function cleanNonNegativeInt(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(1_000_000, Math.floor(parsed));
}

function cleanNullableNonNegativeInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.min(1_000_000, Math.floor(parsed));
}

function cleanNullablePositiveInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 1_000_000_000) {
    return null;
  }
  return parsed;
}

function cleanNullableRate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.min(10_000, Math.round(parsed * 10) / 10);
}

function sanitizeAccount(raw: unknown): MarketplaceBotAccountSnapshot | null {
  if (!isRecord(raw)) return null;
  const key = cleanText(raw.key, 64);
  if (!key) return null;
  return {
    dailyLimit: cleanNullableNonNegativeInt(raw.dailyLimit),
    displayName: cleanText(raw.displayName, 80, key),
    key,
    lastScanAt: cleanNullableText(raw.lastScanAt, 40),
    pausedUntil: cleanNullableText(raw.pausedUntil, 40),
    pauseReason: cleanNullableText(raw.pauseReason, 240),
    publishedToday: cleanNonNegativeInt(raw.publishedToday),
    publishedWeek: cleanNonNegativeInt(raw.publishedWeek),
    status: cleanText(raw.status, 32, 'unknown'),
    weeklyLimit: cleanNullableNonNegativeInt(raw.weeklyLimit),
  };
}

function sanitizeUnanswered(raw: unknown): MarketplaceBotUnansweredLead | null {
  if (!isRecord(raw)) return null;
  const account = cleanText(raw.account, 64);
  const title = cleanText(raw.title, 140);
  if (!account && !title) return null;
  return {
    account: account || 'cuenta',
    label: cleanText(raw.label, 120, 'Otros'),
    lastActivity: cleanText(raw.lastActivity, 40),
    neverAnswered: Boolean(raw.neverAnswered),
    startedOn: cleanText(raw.startedOn, 40),
    title: title || 'Anuncio',
  };
}

function sanitizeLeadProduct(raw: unknown): MarketplaceBotLeadProduct | null {
  if (!isRecord(raw)) return null;
  const familyKey = cleanText(raw.familyKey, 80);
  const label = cleanText(raw.label, 120, familyKey || 'Otros');
  if (!familyKey && !label) return null;
  return {
    activeListings: cleanNonNegativeInt(raw.activeListings),
    clicks14d: cleanNonNegativeInt(raw.clicks14d),
    familyKey: familyKey || 'other',
    focus: Boolean(raw.focus),
    label,
    leads14d: cleanNonNegativeInt(raw.leads14d),
    leadsPer100Clicks: cleanNullableRate(raw.leadsPer100Clicks),
  };
}

function sanitizeListing(raw: unknown): MarketplaceBotListing | null {
  if (!isRecord(raw)) return null;
  const key = cleanText(raw.key, 120);
  const title = cleanText(raw.title, 140);
  if (!key || !title) return null;
  const pendingAction = cleanNullableText(raw.pendingAction, 40);
  return {
    account: cleanText(raw.account, 64, 'cuenta'),
    ageDays: cleanNullableNonNegativeInt(raw.ageDays),
    clicks14d: cleanNullableNonNegativeInt(raw.clicks14d),
    executable: Boolean(raw.executable),
    isExactTwin: typeof raw.isExactTwin === 'boolean' ? raw.isExactTwin : null,
    key,
    leads14d: cleanNullableNonNegativeInt(raw.leads14d),
    listedOn: cleanText(raw.listedOn, 40),
    pendingAction,
    pendingActionId: pendingAction
      ? cleanNullablePositiveInt(raw.pendingActionId)
      : null,
    recommendation: cleanText(raw.recommendation, 40, 'none'),
    recommendationLabel: cleanText(raw.recommendationLabel, 80, 'Sin acción'),
    recommendationReason: cleanText(raw.recommendationReason, 280),
    status: cleanText(raw.status, 32, 'unknown'),
    title,
  };
}

function sanitizeQueueItem(raw: unknown): MarketplaceBotQueueItem | null {
  if (!isRecord(raw)) return null;
  const id = cleanText(raw.id, 80);
  const name = cleanText(raw.name, 140);
  if (!id || !name) return null;
  return {
    account: cleanText(raw.account, 64, 'cuenta'),
    approved: Boolean(raw.approved),
    detail: cleanText(raw.detail, 280),
    id,
    name,
    scheduledAt: cleanText(raw.scheduledAt, 40),
    status: cleanText(raw.status, 32, 'planned'),
  };
}

function sanitizeAlert(raw: unknown): MarketplaceBotAlert | null {
  if (!isRecord(raw)) return null;
  const id = cleanText(raw.id, 80);
  const code = cleanText(raw.code, 80);
  if (!id || !code) return null;
  return {
    account: cleanText(raw.account, 64),
    code,
    createdAt: cleanText(raw.createdAt, 40),
    id,
    message: cleanText(raw.message, 500),
    severity: cleanText(raw.severity, 24, 'warning'),
  };
}

function cleanClock(value: unknown): string | null {
  return typeof value === 'string' && marketplaceBotClockPattern.test(value)
    ? value
    : null;
}

function cleanBoundedInt(
  value: unknown,
  limits: { readonly min: number; readonly max: number },
): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= limits.min &&
    value <= limits.max
    ? value
    : null;
}

function cleanDays(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 7) {
    return null;
  }
  const days = new Set<number>();
  for (const day of value) {
    if (
      typeof day !== 'number' ||
      !Number.isInteger(day) ||
      day < 0 ||
      day > 6
    ) {
      return null;
    }
    days.add(day);
  }
  return [...days].sort((left, right) => left - right);
}

function parseScheduleRules(
  raw: Record<string, unknown>,
): MarketplaceBotScheduleRules | null {
  const activeDays = cleanDays(raw.activeDays);
  const startTime = cleanClock(raw.startTime);
  const endTime = cleanClock(raw.endTime);
  const maxPerDay = cleanBoundedInt(
    raw.maxPerDay,
    marketplaceBotScheduleLimits.maxPerDay,
  );
  const intervalMinutes = cleanBoundedInt(
    raw.intervalMinutes,
    marketplaceBotScheduleLimits.intervalMinutes,
  );
  if (
    !activeDays ||
    !startTime ||
    !endTime ||
    endTime <= startTime ||
    maxPerDay === null ||
    intervalMinutes === null
  ) {
    return null;
  }
  return { activeDays, endTime, intervalMinutes, maxPerDay, startTime };
}

function sanitizeSchedule(raw: unknown): MarketplaceBotSchedule | null {
  if (!isRecord(raw)) return null;
  const rules = parseScheduleRules(raw);
  if (!rules) return null;
  const botTime =
    typeof raw.botTime === 'string' &&
    isValidMarketplaceBotLocalDateTime(raw.botTime)
      ? raw.botTime
      : null;
  return { ...rules, botTime };
}

function sanitizeList<T>(
  raw: unknown,
  maxItems: number,
  mapper: (entry: unknown) => T | null,
): T[] {
  if (!Array.isArray(raw)) return [];
  const items: T[] = [];
  for (const entry of raw) {
    if (items.length >= maxItems) break;
    const mapped = mapper(entry);
    if (mapped !== null) items.push(mapped);
  }
  return items;
}

/**
 * Normalizes untrusted snapshot JSON from the bot into a bounded, safe
 * structure before storing it in PostgreSQL or returning it to the UI.
 */
export function sanitizeMarketplaceBotSnapshot(
  raw: unknown,
): MarketplaceBotSnapshot {
  const root = isRecord(raw) ? raw : {};
  const workerRaw = isRecord(root.worker) ? root.worker : {};
  const leadsRaw = isRecord(root.leads) ? root.leads : {};
  const listingsRaw = isRecord(root.listings) ? root.listings : {};
  const queueRaw = isRecord(root.queue) ? root.queue : {};
  const summaryRaw = isRecord(queueRaw.summary) ? queueRaw.summary : {};
  const summary: Record<string, number> = {};
  for (const key of [
    'planned',
    'queued',
    'running',
    'retry',
    'published',
    'blocked',
    'cancelled',
  ]) {
    summary[key] = cleanNonNegativeInt(summaryRaw[key]);
  }

  return {
    accounts: sanitizeList(root.accounts, MAX_ACCOUNTS, sanitizeAccount),
    alerts: sanitizeList(root.alerts, MAX_ALERTS, sanitizeAlert),
    leads: {
      awaitingReply: cleanNonNegativeInt(leadsRaw.awaitingReply),
      products: sanitizeList(
        leadsRaw.products,
        MAX_PRODUCTS,
        sanitizeLeadProduct,
      ),
      total14d: cleanNonNegativeInt(leadsRaw.total14d),
      unanswered: sanitizeList(
        leadsRaw.unanswered,
        MAX_UNANSWERED,
        sanitizeUnanswered,
      ),
      unansweredRecent: cleanNonNegativeInt(leadsRaw.unansweredRecent),
    },
    listings: {
      actionable: cleanNonNegativeInt(listingsRaw.actionable),
      items: sanitizeList(listingsRaw.items, MAX_LISTINGS, sanitizeListing),
      totalActive: cleanNonNegativeInt(listingsRaw.totalActive),
    },
    queue: {
      summary,
      upcoming: sanitizeList(
        queueRaw.upcoming,
        MAX_QUEUE_ITEMS,
        sanitizeQueueItem,
      ),
    },
    schedule: sanitizeSchedule(root.schedule),
    worker: {
      currentItem: cleanNullableText(workerRaw.currentItem, 140),
      enabled: Boolean(workerRaw.enabled),
      mode: cleanText(workerRaw.mode, 32, 'semiautomatic'),
      processRunning: Boolean(workerRaw.processRunning),
      safetyLevel: cleanText(workerRaw.safetyLevel, 32, 'balanced'),
      status: cleanText(workerRaw.status, 32, 'idle'),
    },
  };
}

function requireAccountName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new IntegrationKeyError('INVALID_REQUEST');
  }
  const trimmed = value.trim();
  if (!accountNamePattern.test(trimmed)) {
    throw new IntegrationKeyError('INVALID_REQUEST');
  }
  return trimmed;
}

function requireSafeCode(value: unknown): string {
  if (typeof value !== 'string') {
    throw new IntegrationKeyError('INVALID_REQUEST');
  }
  const trimmed = value.trim();
  if (!safeCodePattern.test(trimmed)) {
    throw new IntegrationKeyError('INVALID_REQUEST');
  }
  return trimmed;
}

/**
 * Validates a command payload submitted by an authenticated administrator
 * before persisting it for the bot.
 */
export function parseMarketplaceBotCommandPayload(
  raw: unknown,
): MarketplaceBotCommandPayload {
  if (!isRecord(raw) || typeof raw.type !== 'string') {
    throw new IntegrationKeyError('INVALID_REQUEST');
  }

  switch (raw.type) {
    case 'SET_BOT_ENABLED': {
      if (typeof raw.enabled !== 'boolean') {
        throw new IntegrationKeyError('INVALID_REQUEST');
      }
      return { enabled: raw.enabled, type: 'SET_BOT_ENABLED' };
    }
    case 'GENERATE_WEEK': {
      if (typeof raw.replace !== 'boolean') {
        throw new IntegrationKeyError('INVALID_REQUEST');
      }
      return { replace: raw.replace, type: 'GENERATE_WEEK' };
    }
    case 'APPROVE_QUEUE_ITEMS': {
      if (!Array.isArray(raw.ids) || raw.ids.length > MAX_APPROVE_IDS) {
        throw new IntegrationKeyError('INVALID_REQUEST');
      }
      const ids = raw.ids.map((id) => requireSafeCode(id));
      return { ids, type: 'APPROVE_QUEUE_ITEMS' };
    }
    case 'QUEUE_ITEM_ACTION': {
      const id = requireSafeCode(raw.id);
      const action = raw.action as MarketplaceBotQueueAction;
      if (!marketplaceBotQueueActions.includes(action)) {
        throw new IntegrationKeyError('INVALID_REQUEST');
      }
      if (action === 'move') {
        if (
          typeof raw.scheduledAt !== 'string' ||
          !isValidMarketplaceBotLocalDateTime(raw.scheduledAt)
        ) {
          throw new IntegrationKeyError('INVALID_REQUEST');
        }
        return {
          action,
          id,
          scheduledAt: raw.scheduledAt,
          type: 'QUEUE_ITEM_ACTION',
        };
      }
      return { action, id, type: 'QUEUE_ITEM_ACTION' };
    }
    case 'LISTING_ACTION': {
      const key = requireSafeCode(raw.key);
      const action = raw.action as MarketplaceBotListingAction;
      if (!marketplaceBotListingActions.includes(action)) {
        throw new IntegrationKeyError('INVALID_REQUEST');
      }
      return { action, key, type: 'LISTING_ACTION' };
    }
    case 'CANCEL_LISTING_ACTION': {
      const id = Number(raw.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new IntegrationKeyError('INVALID_REQUEST');
      }
      return { id, type: 'CANCEL_LISTING_ACTION' };
    }
    case 'REQUEST_SCAN': {
      const account =
        raw.account === null || raw.account === undefined || raw.account === ''
          ? null
          : requireAccountName(raw.account);
      return { account, type: 'REQUEST_SCAN' };
    }
    case 'SYNC_SGI_CATALOG':
      return { type: 'SYNC_SGI_CATALOG' };
    case 'PAUSE_ACCOUNT': {
      const account = requireAccountName(raw.account);
      const hours = Number(raw.hours);
      if (!Number.isInteger(hours) || hours < 1 || hours > 24 * 30) {
        throw new IntegrationKeyError('INVALID_REQUEST');
      }
      return { account, hours, type: 'PAUSE_ACCOUNT' };
    }
    case 'RESUME_ACCOUNT': {
      const account = requireAccountName(raw.account);
      return { account, type: 'RESUME_ACCOUNT' };
    }
    case 'SET_SAFETY_LEVEL': {
      const level = raw.level as MarketplaceBotSafetyLevel;
      if (!marketplaceBotSafetyLevels.includes(level)) {
        throw new IntegrationKeyError('INVALID_REQUEST');
      }
      return { level, type: 'SET_SAFETY_LEVEL' };
    }
    case 'RESOLVE_ALERT': {
      const id = requireSafeCode(raw.id);
      return { id, type: 'RESOLVE_ALERT' };
    }
    case 'RESOLVE_ALL_ALERTS':
      return { type: 'RESOLVE_ALL_ALERTS' };
    case 'SET_SCHEDULE': {
      const rules = parseScheduleRules(raw);
      if (!rules || typeof raw.regenerate !== 'boolean') {
        throw new IntegrationKeyError('INVALID_REQUEST');
      }
      return { ...rules, regenerate: raw.regenerate, type: 'SET_SCHEDULE' };
    }
    default:
      throw new IntegrationKeyError('INVALID_REQUEST');
  }
}
