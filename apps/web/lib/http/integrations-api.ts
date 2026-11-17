import type {
  CreateIntegrationKeyRequest,
  CreatedIntegrationKeyData,
  IntegrationKeySummary,
  MarketplaceBotCommandPayload,
  MarketplaceBotCommandView,
  MarketplaceBotStateData,
} from '@sgi/contracts';

import { apiRequest } from './api-client';

/**
 * Read-only integration keys and Marketplace bot monitoring/remote commands.
 * The secret returned by `create` is shown once and never stored by the web
 * app: it is a credential for an unattended program.
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
  getBotState: (signal?: AbortSignal) =>
    apiRequest<MarketplaceBotStateData>(
      '/api/v1/integrations/marketplace-bot',
      signal ? { signal } : {},
    ),
  enqueueBotCommand: (
    instanceId: string,
    command: MarketplaceBotCommandPayload,
    requestId: string,
    csrfToken: string,
  ) =>
    apiRequest<MarketplaceBotCommandView>(
      `/api/v1/integrations/marketplace-bot/${encodeURIComponent(instanceId)}/commands`,
      {
        body: { command, requestId },
        csrfToken,
        method: 'POST',
      },
    ),
  cancelBotCommand: (commandId: string, csrfToken: string) =>
    apiRequest<MarketplaceBotCommandView>(
      `/api/v1/integrations/marketplace-bot/commands/${encodeURIComponent(commandId)}/cancel`,
      { csrfToken, method: 'POST' },
    ),
};
