import { describe, expect, it } from 'vitest';

import {
  findOverrideChangeViolation,
  findRoleChangeViolation,
  hasChanges,
  planOverrideChange,
  planRoleChange,
} from './user-access-policy.js';

describe('user access policy (ADR-018)', () => {
  describe('roles', () => {
    it('plans only the difference between the current and desired sets', () => {
      const plan = planRoleChange(
        ['INVENTORY_MANAGER', 'SALES'],
        ['SALES', 'FINANCE', 'FINANCE'],
      );
      expect(plan).toEqual({
        added: ['FINANCE'],
        removed: ['INVENTORY_MANAGER'],
      });
      expect(hasChanges(plan)).toBe(true);
      expect(hasChanges(planRoleChange(['SALES'], ['SALES']))).toBe(false);
    });

    it('refuses to assign ADMIN to anyone', () => {
      expect(
        findRoleChangeViolation(planRoleChange(['SALES'], ['ADMIN', 'SALES'])),
      ).toBe('ADMIN_ROLE_NOT_EDITABLE');
    });

    it('refuses to remove ADMIN, including from the administrator', () => {
      expect(
        findRoleChangeViolation(planRoleChange(['ADMIN', 'SALES'], ['SALES'])),
      ).toBe('ADMIN_ROLE_NOT_EDITABLE');
    });

    it('lets the administrator change their other roles', () => {
      expect(
        findRoleChangeViolation(
          planRoleChange(['ADMIN', 'FINANCE', 'SALES'], ['ADMIN', 'SALES']),
        ),
      ).toBeNull();
    });
  });

  describe('exceptions', () => {
    it('revokes and recreates an exception whose effect changes', () => {
      const plan = planOverrideChange(
        [
          { code: 'finances.read', effect: 'GRANT' },
          { code: 'sales.create', effect: 'DENY' },
        ],
        [
          { code: 'finances.read', effect: 'DENY' },
          { code: 'reports.read', effect: 'GRANT' },
        ],
      );
      expect(plan).toEqual({
        create: [
          { code: 'finances.read', effect: 'DENY' },
          { code: 'reports.read', effect: 'GRANT' },
        ],
        revoke: ['finances.read', 'sales.create'],
      });
    });

    it('plans nothing when the desired set is already in force', () => {
      const current = [{ code: 'sales.create', effect: 'DENY' as const }];
      expect(hasChanges(planOverrideChange(current, current))).toBe(false);
    });

    it('grants administrator-only permissions only to the administrator', () => {
      for (const code of [
        'sales.cancel',
        'inventory.audit.approve',
        'users.roles.manage',
        'integrations.manage',
      ]) {
        const plan = planOverrideChange([], [{ code, effect: 'GRANT' }]);
        expect(findOverrideChangeViolation(plan, false)).toBe(
          'ADMIN_PERMISSION_RESTRICTED',
        );
        expect(findOverrideChangeViolation(plan, true)).toBeNull();
      }
    });

    it('lets anyone be denied an administrator-only permission', () => {
      const plan = planOverrideChange(
        [],
        [{ code: 'sales.cancel', effect: 'DENY' }],
      );
      expect(findOverrideChangeViolation(plan, false)).toBeNull();
    });

    it('never denies the administrator access to the panel', () => {
      for (const code of ['users.read', 'users.roles.manage']) {
        const plan = planOverrideChange([], [{ code, effect: 'DENY' }]);
        expect(findOverrideChangeViolation(plan, true)).toBe(
          'ADMIN_ACCESS_PROTECTED',
        );
        expect(findOverrideChangeViolation(plan, false)).toBeNull();
      }
    });

    it('lets ordinary permissions be granted or denied to anyone', () => {
      const plan = planOverrideChange(
        [],
        [
          { code: 'finances.read', effect: 'GRANT' },
          { code: 'sales.create', effect: 'DENY' },
        ],
      );
      expect(findOverrideChangeViolation(plan, false)).toBeNull();
      expect(findOverrideChangeViolation(plan, true)).toBeNull();
    });

    it('does not judge exceptions the person already had', () => {
      // Clearing an unrelated exception must not be blocked by an existing row
      // that would no longer be creatable.
      const plan = planOverrideChange(
        [
          { code: 'sales.cancel', effect: 'GRANT' },
          { code: 'finances.read', effect: 'DENY' },
        ],
        [{ code: 'sales.cancel', effect: 'GRANT' }],
      );
      expect(plan.create).toEqual([]);
      expect(findOverrideChangeViolation(plan, false)).toBeNull();
    });
  });
});
