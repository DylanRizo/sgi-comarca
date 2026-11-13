/**
 * Marketplace bot monitoring and remote commands (ADR-024).
 *
 * The bot runs on a local computer behind a home router. It pushes a compact
 * snapshot over HTTPS with its integration key and, in the same exchange,
 * receives the commands queued from the SGI. The SGI never reaches into the
 * computer and never executes the commands itself: it only stores them until
 * the bot reports their outcome.
 */

export const marketplaceBotCommandTypes = [
  'SET_BOT_ENABLED',
  'GENERATE_WEEK',
  'APPROVE_QUEUE_ITEMS',
  'QUEUE_ITEM_ACTION',
  'LISTING_ACTION',
  'CANCEL_LISTING_ACTION',
  'REQUEST_SCAN',
  'SYNC_SGI_CATALOG',
  'PAUSE_ACCOUNT',
  'RESUME_ACCOUNT',
  'SET_SAFETY_LEVEL',
  'RESOLVE_ALERT',
  'RESOLVE_ALL_ALERTS',
] as const;
export type MarketplaceBotCommandType =
  (typeof marketplaceBotCommandTypes)[number];

export const marketplaceBotQueueActions = [
  'approve',
  'cancel',
  'retry',
] as const;
export type MarketplaceBotQueueAction =
  (typeof marketplaceBotQueueActions)[number];

export const marketplaceBotListingActions = [
  'renew',
  'delete',
  'relist',
  'mark_out_of_stock',
  'mark_available',
] as const;
export type MarketplaceBotListingAction =
  (typeof marketplaceBotListingActions)[number];

export const marketplaceBotSafetyLevels = [
  'conservative',
  'balanced',
  'active',
] as const;
export type MarketplaceBotSafetyLevel =
  (typeof marketplaceBotSafetyLevels)[number];

/** Payload per command type. Validated by the API before it is stored. */
export type MarketplaceBotCommandPayload =
  | { type: 'SET_BOT_ENABLED'; enabled: boolean }
  | { type: 'GENERATE_WEEK'; replace: boolean }
  | { type: 'APPROVE_QUEUE_ITEMS'; ids: readonly string[] }
  | {
      type: 'QUEUE_ITEM_ACTION';
      id: string;
      action: MarketplaceBotQueueAction;
    }
  | {
      type: 'LISTING_ACTION';
      key: string;
      action: MarketplaceBotListingAction;
    }
  | { type: 'CANCEL_LISTING_ACTION'; id: number }
  | { type: 'REQUEST_SCAN'; account: string | null }
  | { type: 'SYNC_SGI_CATALOG' }
  | { type: 'PAUSE_ACCOUNT'; account: string; hours: number }
  | { type: 'RESUME_ACCOUNT'; account: string }
  | { type: 'SET_SAFETY_LEVEL'; level: MarketplaceBotSafetyLevel }
  | { type: 'RESOLVE_ALERT'; id: string }
  | { type: 'RESOLVE_ALL_ALERTS' };

/**
 * `EXPIRED`: the bot did not pick the command up in time. An old order (for
 * example deleting a listing) must not run hours later without a person
 * deciding again.
 */
export type MarketplaceBotCommandStatus =
  'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';

export type MarketplaceBotConnection = 'ONLINE' | 'DELAYED' | 'OFFLINE';

export interface MarketplaceBotCommandView {
  id: string;
  type: MarketplaceBotCommandType;
  payload: MarketplaceBotCommandPayload;
  status: MarketplaceBotCommandStatus;
  resultDetail: string | null;
  createdAt: string;
  createdByName: string;
  completedAt: string | null;
}

export interface MarketplaceBotAccountSnapshot {
  key: string;
  displayName: string;
  status: string;
  publishedToday: number;
  dailyLimit: number | null;
  publishedWeek: number;
  weeklyLimit: number | null;
  pausedUntil: string | null;
  pauseReason: string | null;
  lastScanAt: string | null;
}

export interface MarketplaceBotLeadProduct {
  familyKey: string;
  label: string;
  activeListings: number;
  clicks14d: number;
  leads14d: number;
  leadsPer100Clicks: number | null;
  focus: boolean;
}

export interface MarketplaceBotUnansweredLead {
  account: string;
  title: string;
  label: string;
  startedOn: string;
  lastActivity: string;
  neverAnswered: boolean;
}

export interface MarketplaceBotListing {
  key: string;
  account: string;
  title: string;
  status: string;
  listedOn: string;
  ageDays: number | null;
  clicks14d: number | null;
  leads14d: number | null;
  recommendation: string;
  recommendationLabel: string;
  recommendationReason: string;
  executable: boolean;
  pendingAction: string | null;
}

export interface MarketplaceBotQueueItem {
  id: string;
  account: string;
  name: string;
  scheduledAt: string;
  status: string;
  approved: boolean;
  detail: string;
}

export interface MarketplaceBotAlert {
  id: string;
  severity: string;
  code: string;
  message: string;
  account: string;
  createdAt: string;
}

/**
 * What the bot reports. Every list is bounded and every text is trimmed by
 * the API: the snapshot is untrusted input shown to people.
 */
export interface MarketplaceBotSnapshot {
  worker: {
    processRunning: boolean;
    status: string;
    currentItem: string | null;
    enabled: boolean;
    mode: string;
    safetyLevel: string;
  };
  accounts: readonly MarketplaceBotAccountSnapshot[];
  leads: {
    total14d: number;
    awaitingReply: number;
    unansweredRecent: number;
    unanswered: readonly MarketplaceBotUnansweredLead[];
    products: readonly MarketplaceBotLeadProduct[];
  };
  listings: {
    totalActive: number;
    actionable: number;
    items: readonly MarketplaceBotListing[];
  };
  queue: {
    summary: Readonly<Record<string, number>>;
    upcoming: readonly MarketplaceBotQueueItem[];
  };
  alerts: readonly MarketplaceBotAlert[];
}

export interface MarketplaceBotInstanceView {
  id: string;
  instanceName: string;
  botVersion: string;
  connection: MarketplaceBotConnection;
  lastHeartbeatAt: string;
  snapshot: MarketplaceBotSnapshot;
  commands: readonly MarketplaceBotCommandView[];
}

export interface MarketplaceBotStateData {
  /** Whether the person may queue commands; reading never implies it. */
  canControl: boolean;
  instances: readonly MarketplaceBotInstanceView[];
}

export interface MarketplaceBotCommandResult {
  id: string;
  status: 'COMPLETED' | 'FAILED';
  detail: string;
}

/** Body of `POST /api/v1/integrations/marketplace-bot/sync`. */
export interface MarketplaceBotSyncRequest {
  instanceKey: string;
  instanceName: string;
  botVersion: string;
  snapshot: unknown;
  commandResults: readonly MarketplaceBotCommandResult[];
}

export interface MarketplaceBotPendingCommand {
  id: string;
  payload: MarketplaceBotCommandPayload;
  createdAt: string;
}

export interface MarketplaceBotSyncData {
  pendingCommands: readonly MarketplaceBotPendingCommand[];
}

/** Body of `POST /api/v1/integrations/marketplace-bot/:instanceId/commands`. */
export interface EnqueueMarketplaceBotCommandRequest {
  command: MarketplaceBotCommandPayload;
}
