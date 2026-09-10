import type {
  AlexaAuthorizationData,
  AlexaAuthorizationRequest,
  AlexaLinkStatusData,
} from '@sgi/contracts';

import { apiRequest } from './api-client';

export const alexaApi = {
  authorize: (input: AlexaAuthorizationRequest, csrfToken: string) =>
    apiRequest<AlexaAuthorizationData>('/api/v1/alexa/oauth/authorize', {
      body: input,
      csrfToken,
      method: 'POST',
    }),
  revoke: (csrfToken: string) =>
    apiRequest<void>('/api/v1/alexa/oauth/revoke', {
      csrfToken,
      method: 'POST',
    }),
  status: () => apiRequest<AlexaLinkStatusData>('/api/v1/alexa/oauth/status'),
};
