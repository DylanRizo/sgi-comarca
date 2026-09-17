import type {
  AdminInvitationData,
  PaginatedData,
  RoleSummary,
  UserDetail,
  UserDirectoryEntry,
} from '@sgi/contracts';

import { apiRequest } from './api-client';

const mutation = (
  body: unknown,
  csrfToken: string,
  idempotencyKey: string,
) => ({ body, csrfToken, idempotencyKey, method: 'POST' as const });

/**
 * Administration reads and the commands the API already exposed. The
 * activation token returned by `invite` is shown once and never stored: it is
 * the only thing standing between a stranger and an account.
 */
export const userAdminApi = {
  list: (search: string, page: number, signal?: AbortSignal) =>
    apiRequest<PaginatedData<UserDirectoryEntry>>(
      `/api/v1/users?search=${encodeURIComponent(search)}&page=${String(page)}&pageSize=25`,
      signal ? { signal } : {},
    ),
  detail: (userId: string, signal?: AbortSignal) =>
    apiRequest<UserDetail>(
      `/api/v1/users/${encodeURIComponent(userId)}`,
      signal ? { signal } : {},
    ),
  roles: (signal?: AbortSignal) =>
    apiRequest<readonly RoleSummary[]>(
      '/api/v1/roles',
      signal ? { signal } : {},
    ),
  invite: (userId: string, csrf: string, key: string) =>
    apiRequest<AdminInvitationData>(
      `/api/v1/users/${encodeURIComponent(userId)}/invitations`,
      mutation({}, csrf, key),
    ),
  revokeCredential: (userId: string, csrf: string, key: string) =>
    apiRequest<{ revoked: boolean }>(
      `/api/v1/users/${encodeURIComponent(userId)}/credentials/revoke`,
      mutation({}, csrf, key),
    ),
  revokeSessions: (userId: string, csrf: string, key: string) =>
    apiRequest<{ revoked: number }>(
      `/api/v1/users/${encodeURIComponent(userId)}/sessions/revoke`,
      mutation({}, csrf, key),
    ),
  deactivate: (userId: string, csrf: string, key: string) =>
    apiRequest<{ status: string }>(
      `/api/v1/users/${encodeURIComponent(userId)}/deactivate`,
      mutation({}, csrf, key),
    ),
};
