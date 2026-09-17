import type {
  CreateIntegrationKeyRequest,
  CreatedIntegrationKeyData,
  IntegrationKeySummary,
} from '@sgi/contracts';

import { apiRequest } from './api-client';

/**
 * Read-only integration keys. The secret returned by `create` is shown once and
 * never stored by the web app: it is a credential for an unattended program.
 */
export const integrationsApi = {
  list: (signal?: AbortSignal) =>
    apiRequest<readonly IntegrationKeySummary[]>(
      '/api/v1/integrations/keys',
      signal ? { signal } : {},
    ),
  create: (input: CreateIntegrationKeyRequest, csrfToken: string) =>
    apiRequest<CreatedIntegrationKeyData>('/api/v1/integrations/keys', {
      body: input,
      csrfToken,
      method: 'POST',
    }),
  revoke: (keyId: string, csrfToken: string) =>
    apiRequest<IntegrationKeySummary>(
      `/api/v1/integrations/keys/${encodeURIComponent(keyId)}/revoke`,
      { csrfToken, method: 'POST' },
    ),
};
