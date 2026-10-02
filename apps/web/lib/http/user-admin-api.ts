import type {
  AdminInvitationData,
  PaginatedData,
  PermissionSummary,
  RoleSummary,
  UpdateUserPermissionsInput,
  UpdateUserRolesInput,
  UserDetail,
  UserDirectoryEntry,
} from '@sgi/contracts';

import { apiRequest } from './api-client';

const mutation = (
  body: unknown,
  csrfToken: string,
  idempotencyKey: string,
) => ({ body, csrfToken, idempotencyKey, method: 'POST' as const });

const replacement = (
  body: unknown,
  csrfToken: string,
  idempotencyKey: string,
) => ({ body, csrfToken, idempotencyKey, method: 'PUT' as const });

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
  reactivate: (userId: string, csrf: string, key: string) =>
    apiRequest<void>(
      `/api/v1/users/${encodeURIComponent(userId)}/reactivate`,
      mutation({}, csrf, key),
    ),
  permissions: (signal?: AbortSignal) =>
    apiRequest<readonly PermissionSummary[]>(
      '/api/v1/permissions',
      signal ? { signal } : {},
    ),
  /** PUT replaces the whole set; the response is the detail after commit. */
  replaceRoles: (
    userId: string,
    input: UpdateUserRolesInput,
    csrf: string,
    key: string,
  ) =>
    apiRequest<UserDetail>(
      `/api/v1/users/${encodeURIComponent(userId)}/roles`,
      replacement(input, csrf, key),
    ),
  replaceOverrides: (
    userId: string,
    input: UpdateUserPermissionsInput,
    csrf: string,
    key: string,
  ) =>
    apiRequest<UserDetail>(
      `/api/v1/users/${encodeURIComponent(userId)}/permissions`,
      replacement(input, csrf, key),
    ),
};
