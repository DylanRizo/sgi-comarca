export type AdminInvitationData = {
  token: string;
};

export type UserAdministrationPublicErrorCode =
  | 'ADMIN_OPERATION_CONFLICT'
  | 'ADMIN_USER_NOT_FOUND'
  | 'ADMIN_USER_STATE_CONFLICT'
  | 'LAST_ADMIN_PROTECTED';

/**
 * Directory of people who can use the system. Roles and permissions are
 * granted and revoked rather than deleted, so these views report what is in
 * force now; the history stays in the database and in the audit log.
 *
 * There is no email address in this system: a person is identified by their
 * login identifier, and the activation link travels by a private channel.
 */
export interface UserDirectoryEntry {
  id: string;
  loginIdentifier: string;
  displayName: string;
  status: 'PENDING_ACTIVATION' | 'ACTIVE' | 'DISABLED';
  /** Role codes in force, ordered as the manifest declares them. */
  roles: readonly string[];
  activatedAt: string | null;
  createdAt: string;
  /** A person with no active credential cannot sign in even when ACTIVE. */
  hasActiveCredential: boolean;
  activeSessions: number;
  /** Whether an unexpired, unused invitation is outstanding. */
  hasOpenInvitation: boolean;
}

export interface UserPermissionOverride {
  code: string;
  effect: 'GRANT' | 'DENY';
}

export interface UserDetail extends UserDirectoryEntry {
  /**
   * What the person can actually do: role grants plus overrides, with DENY
   * winning. This is the answer the interface must show, because a role name
   * alone never states it.
   */
  effectivePermissions: readonly string[];
  /** Exceptions applied on top of the roles, in force now. */
  overrides: readonly UserPermissionOverride[];
}

export interface RoleSummary {
  code: string;
  name: string;
  description: string | null;
}

export interface UpdateUserRolesInput {
  roleCodes: readonly string[];
}

export interface UpdateUserPermissionsInput {
  overrides: readonly UserPermissionOverride[];
}
