import type {
  ActivateAccountRequest,
  AuthenticationData,
  ChangePasswordRequest,
  CsrfData,
  CurrentSessionData,
  LoginRequest,
} from '@sgi/contracts';

import { apiRequest } from './api-client';

export const authApi = {
  activate: (input: ActivateAccountRequest) =>
    apiRequest<AuthenticationData>('/api/v1/auth/activate', {
      body: input,
      method: 'POST',
    }),
  changePassword: (input: ChangePasswordRequest, csrfToken: string) =>
    apiRequest<void>('/api/v1/auth/change-password', {
      body: input,
      csrfToken,
      method: 'POST',
    }),
  csrf: () => apiRequest<CsrfData>('/api/v1/auth/csrf'),
  login: (input: LoginRequest) =>
    apiRequest<AuthenticationData>('/api/v1/auth/login', {
      body: input,
      method: 'POST',
    }),
  logout: (csrfToken: string) =>
    apiRequest<void>('/api/v1/auth/logout', {
      csrfToken,
      method: 'POST',
    }),
  session: (signal?: AbortSignal) =>
    apiRequest<CurrentSessionData>(
      '/api/v1/auth/session',
      signal ? { signal } : {},
    ),
};
