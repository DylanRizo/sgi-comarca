import { describe, expect, it } from 'vitest';

import {
  bootstrapPermissions,
  bootstrapRolePermissions,
  bootstrapRoles,
  bootstrapUserPermissions,
  bootstrapUserRoles,
  bootstrapUsers,
  bootstrapWarehouses,
  grantKey,
} from '../src/bootstrap/manifest.js';
import {
  assertCompatibleRecord,
  BootstrapConflictError,
} from '../src/bootstrap/run-bootstrap.js';

describe('FASE 3B bootstrap manifest', () => {
  it('contains only the approved users, roles, permissions and warehouses', () => {
    expect(
      bootstrapUsers.map(({ loginIdentifier }) => loginIdentifier),
    ).toEqual(['dylan', 'samantha', 'jean', 'luden']);
    expect(bootstrapRoles.map(({ code }) => code).sort()).toEqual(
      [
        'ADMIN',
        'FINANCE',
        'INVENTORY_MANAGER',
        'PARTNER',
        'READ_ONLY',
        'SALES',
      ].sort(),
    );
    expect(bootstrapPermissions.map(({ code }) => code).sort()).toEqual(
      [
        'closings.create',
        'closings.read',
        'closings.reopen',
        'finances.manual.create',
        'finances.read',
        'inventory.adjust',
        'sales.cancel',
        'sales.confirm_in_transit',
        'sales.create',
        'transfers.create',
        'users.credentials.revoke',
        'users.invitations.create',
        'users.sessions.revoke',
        'users.status.manage',
      ].sort(),
    );
    expect(bootstrapWarehouses.map(({ code }) => code).sort()).toEqual(
      ['CASA_DYLAN', 'CASA_JEAN', 'CASA_LUDEN'].sort(),
    );
  });

  it('contains exactly the approved grants', () => {
    expect(
      bootstrapUserRoles
        .map(({ loginIdentifier, roleCode }) =>
          grantKey(loginIdentifier, roleCode),
        )
        .sort(),
    ).toEqual(
      [
        'dylan:ADMIN',
        'dylan:FINANCE',
        'dylan:INVENTORY_MANAGER',
        'dylan:SALES',
        'jean:INVENTORY_MANAGER',
        'jean:SALES',
        'luden:INVENTORY_MANAGER',
        'luden:SALES',
        'samantha:FINANCE',
        'samantha:INVENTORY_MANAGER',
        'samantha:SALES',
      ].sort(),
    );
    expect(
      bootstrapRolePermissions
        .map(({ permissionCode, roleCode }) =>
          grantKey(roleCode, permissionCode),
        )
        .sort(),
    ).toEqual(
      [
        'ADMIN:users.credentials.revoke',
        'ADMIN:users.invitations.create',
        'ADMIN:users.sessions.revoke',
        'ADMIN:users.status.manage',
        'FINANCE:closings.create',
        'FINANCE:closings.read',
        'FINANCE:closings.reopen',
        'FINANCE:finances.manual.create',
        'FINANCE:finances.read',
        'INVENTORY_MANAGER:inventory.adjust',
        'SALES:sales.confirm_in_transit',
        'SALES:sales.create',
      ].sort(),
    );
    expect(bootstrapUserPermissions).toEqual([
      { loginIdentifier: 'dylan', permissionCode: 'sales.cancel' },
    ]);
    expect(bootstrapPermissions).toHaveLength(14);
    expect(bootstrapUserRoles).toHaveLength(11);
    expect(bootstrapRolePermissions).toHaveLength(12);
    expect(bootstrapUserPermissions).toHaveLength(1);
  });

  it('leaves transfers.create without grants and omits unapproved permissions', () => {
    const rolePermissionCodes: readonly string[] = bootstrapRolePermissions.map(
      ({ permissionCode }) => permissionCode,
    );
    const userPermissionCodes: readonly string[] = bootstrapUserPermissions.map(
      ({ permissionCode }) => permissionCode,
    );
    const permissionCodes: readonly string[] = bootstrapPermissions.map(
      ({ code }) => code,
    );

    expect(rolePermissionCodes).not.toContain('transfers.create');
    expect(userPermissionCodes).not.toContain('transfers.create');
    expect(permissionCodes).not.toContain('roles.manage_financial_access');
  });

  it('rejects incompatible existing records instead of overwriting them', () => {
    expect(() =>
      assertCompatibleRecord(
        'warehouse CASA_DYLAN',
        { active: true, name: 'Conflicting name' },
        { active: true, name: 'Casa Dylan' },
      ),
    ).toThrow(BootstrapConflictError);
  });
});
