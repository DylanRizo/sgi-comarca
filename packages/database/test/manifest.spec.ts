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
        'analytics.read',
        'closings.create',
        'closings.read',
        'closings.reopen',
        'finances.manual.create',
        'finances.read',
        'inventory.adjust',
        'inventory.audit.approve',
        'inventory.audit.create',
        'inventory.read',
        'reports.read',
        'sales.cancel',
        'sales.confirm_in_transit',
        'sales.create',
        'sales.read',
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
        'INVENTORY_MANAGER:analytics.read',
        'INVENTORY_MANAGER:inventory.adjust',
        'INVENTORY_MANAGER:inventory.audit.create',
        'INVENTORY_MANAGER:inventory.read',
        'INVENTORY_MANAGER:reports.read',
        'INVENTORY_MANAGER:transfers.create',
        'SALES:analytics.read',
        'SALES:reports.read',
        'SALES:sales.confirm_in_transit',
        'SALES:sales.create',
        'SALES:sales.read',
      ].sort(),
    );
    expect(bootstrapUserPermissions).toEqual([
      { loginIdentifier: 'dylan', permissionCode: 'sales.cancel' },
      { loginIdentifier: 'dylan', permissionCode: 'inventory.audit.approve' },
    ]);
    expect(bootstrapPermissions).toHaveLength(20);
    expect(bootstrapUserRoles).toHaveLength(11);
    expect(bootstrapRolePermissions).toHaveLength(20);
    expect(bootstrapUserPermissions).toHaveLength(2);
  });

  it('separates counting a warehouse from approving the count into the ledger', () => {
    // The owner approved this split on 2026-08-31. Capturing a count is
    // operational work for anyone managing inventory; approving one writes
    // stock through the FASE 5C adjustment path, so it stays a direct grant
    // and whoever counted a warehouse cannot approve their own count.
    expect(
      bootstrapRolePermissions
        .filter(
          ({ permissionCode }) => permissionCode === 'inventory.audit.create',
        )
        .map(({ roleCode }) => roleCode),
    ).toEqual(['INVENTORY_MANAGER']);

    expect(
      bootstrapRolePermissions.some(
        ({ permissionCode }) => permissionCode === 'inventory.audit.approve',
      ),
    ).toBe(false);
    expect(
      bootstrapUserPermissions.filter(
        ({ permissionCode }) => permissionCode === 'inventory.audit.approve',
      ),
    ).toEqual([
      { loginIdentifier: 'dylan', permissionCode: 'inventory.audit.approve' },
    ]);
  });

  it('grants reporting to the operational roles without widening access', () => {
    // Reporting is safe to spread because every report additionally requires
    // its domain's read permission and every monetary column requires
    // finances.read, which neither of these roles carries.
    for (const code of ['reports.read', 'analytics.read']) {
      expect(
        bootstrapRolePermissions
          .filter(({ permissionCode }) => permissionCode === code)
          .map(({ roleCode }) => roleCode)
          .sort(),
      ).toEqual(['INVENTORY_MANAGER', 'SALES']);
      expect(
        bootstrapUserPermissions.some(
          ({ permissionCode }) => permissionCode === code,
        ),
      ).toBe(false);
    }

    expect(
      bootstrapRolePermissions.some(
        ({ permissionCode, roleCode }) =>
          permissionCode === 'finances.read' && roleCode !== 'FINANCE',
      ),
    ).toBe(false);
  });

  it('grants sales.read only to SALES without an ADMIN bypass', () => {
    const salesReadGrants = bootstrapRolePermissions
      .filter(({ permissionCode }) => permissionCode === 'sales.read')
      .map(({ roleCode }) => roleCode);

    expect(salesReadGrants).toEqual(['SALES']);
    expect(salesReadGrants).not.toContain('ADMIN');
    expect(salesReadGrants).not.toContain('FINANCE');
    expect(salesReadGrants).not.toContain('INVENTORY_MANAGER');
    expect(salesReadGrants).not.toContain('READ_ONLY');
  });

  it('grants inventory.read only to INVENTORY_MANAGER', () => {
    const inventoryReadGrants = bootstrapRolePermissions
      .filter(({ permissionCode }) => permissionCode === 'inventory.read')
      .map(({ roleCode }) => roleCode);

    expect(inventoryReadGrants).toEqual(['INVENTORY_MANAGER']);
    expect(inventoryReadGrants).not.toContain('ADMIN');
    expect(inventoryReadGrants).not.toContain('FINANCE');
    expect(inventoryReadGrants).not.toContain('READ_ONLY');
    expect(inventoryReadGrants).not.toContain('SALES');
  });

  it('grants transfers.create only to INVENTORY_MANAGER and omits unapproved permissions', () => {
    const transferRoleGrants = bootstrapRolePermissions
      .filter(({ permissionCode }) => permissionCode === 'transfers.create')
      .map(({ roleCode }) => roleCode);
    const userPermissionCodes: readonly string[] = bootstrapUserPermissions.map(
      ({ permissionCode }) => permissionCode,
    );
    const permissionCodes: readonly string[] = bootstrapPermissions.map(
      ({ code }) => code,
    );

    expect(transferRoleGrants).toEqual(['INVENTORY_MANAGER']);
    expect(transferRoleGrants).not.toContain('ADMIN');
    expect(transferRoleGrants).not.toContain('FINANCE');
    expect(transferRoleGrants).not.toContain('READ_ONLY');
    expect(transferRoleGrants).not.toContain('SALES');
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
