export type AdminInvitationData = {
  token: string;
};

export type UserAdministrationPublicErrorCode =
  | 'ADMIN_ACCESS_PROTECTED'
  | 'ADMIN_OPERATION_CONFLICT'
  | 'ADMIN_PERMISSION_RESTRICTED'
  | 'ADMIN_ROLE_NOT_EDITABLE'
  | 'ADMIN_UNKNOWN_CODE'
  | 'ADMIN_USER_NOT_FOUND'
  | 'ADMIN_USER_STATE_CONFLICT'
  | 'LAST_ADMIN_PROTECTED';

/**
 * ADR-020. The panel never assigns or removes this role: there is exactly one
 * administrator, and changing who it is takes a new decision.
 */
export const administratorRoleCode = 'ADMIN';

/**
 * Permissions that only the administrator may hold as a direct GRANT:
 * `sales.cancel` (DEC-021), `inventory.audit.approve` (whoever counts must not
 * approve their own count), and the ADMIN role's own permissions, because
 * handing those out one by one would build a second administrator piecemeal.
 */
export const administratorOnlyPermissionCodes = [
  'inventory.audit.approve',
  'integrations.manage',
  'sales.cancel',
  'users.credentials.revoke',
  'users.invitations.create',
  'users.read',
  'users.roles.manage',
  'users.sessions.revoke',
  'users.status.manage',
] as const;

/**
 * What the administrator needs to reach and use the panel. Denying either to
 * them would lock them out with nobody able to undo it.
 */
export const panelAccessPermissionCodes = [
  'users.read',
  'users.roles.manage',
] as const;

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
  /** What the role grants today, so the panel can preview a change. */
  permissions: readonly string[];
}

/** The complete set of roles the person should hold; PUT replaces it. */
export interface UpdateUserRolesInput {
  roleCodes: readonly string[];
}

/** The complete set of exceptions the person should have; PUT replaces it. */
export interface UpdateUserPermissionsInput {
  overrides: readonly UserPermissionOverride[];
}

/** A permission of the catalog, so the interface can offer exceptions. */
export interface PermissionSummary {
  code: string;
  description: string;
}
