/**
 * Each integration key is issued for one purpose. The API revalidates the
 * owner's effective permissions on every request.
 */
export const integrationKeyScopes = [
  'inventory.read',
  'marketplace-bot.sync',
] as const;
export type IntegrationKeyScope = (typeof integrationKeyScopes)[number];
export const marketplaceBotInstanceKeyPattern = /^[A-Za-z0-9_-]{8,64}$/u;

export type IntegrationKeyStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export interface IntegrationKeySummary {
  id: string;
  name: string;
  /** First characters of the secret, only to tell keys apart. */
  keyPrefix: string;
  scopes: readonly IntegrationKeyScope[];
  marketplaceBotInstanceKey: string | null;
  status: IntegrationKeyStatus;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CreateIntegrationKeyRequest {
  name: string;
  expiresInDays: number;
  /** Omit for a read-only catalog key. */
  marketplaceBotInstanceKey?: string;
}

export interface CreatedIntegrationKeyData {
  key: IntegrationKeySummary;
  /** Shown exactly once. The database keeps only its SHA-256. */
  secret: string;
}

/**
 * Why a stocked product has no single publishable price. `REVIEW` wins over
 * `MISSING`, which wins over `MIXED`.
 */
export type IntegrationPriceIssue = 'MISSING' | 'MIXED' | 'REVIEW';

/**
 * Deliberately smaller than `ProductInventoryView`: an external publisher
 * receives the sale price and stock only. Cost, valuations and warehouse
 * detail never leave the API.
 */
export interface IntegrationCatalogItem {
  code: string;
  name: string;
  description: string | null;
  totalQuantity: string;
  unitPrice: string | null;
  priceIssue: IntegrationPriceIssue | null;
}
