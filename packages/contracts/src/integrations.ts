/**
 * Read-only integration keys (ADR-017). A key acts on behalf of the person who
 * created it and carries exactly these scopes; the backend revalidates the
 * owner's effective permissions on every request.
 */
export const integrationKeyScopes = ['inventory.read'] as const;
export type IntegrationKeyScope = (typeof integrationKeyScopes)[number];

export type IntegrationKeyStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export interface IntegrationKeySummary {
  id: string;
  name: string;
  /** First characters of the secret, only to tell keys apart. */
  keyPrefix: string;
  scopes: readonly IntegrationKeyScope[];
  status: IntegrationKeyStatus;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CreateIntegrationKeyRequest {
  name: string;
  expiresInDays: number;
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
