import {
  administratorOnlyPermissionCodes,
  administratorRoleCode,
  panelAccessPermissionCodes,
} from '@sgi/contracts';

/**
 * The rules ADR-018 places on the administration panel, kept free of any
 * database so they can be tested on their own. The service reads the current
 * state inside its transaction, plans the change here, and only writes what the
 * plan says.
 */

export type UserAccessViolation =
  | 'ADMIN_ACCESS_PROTECTED'
  | 'ADMIN_PERMISSION_RESTRICTED'
  | 'ADMIN_ROLE_NOT_EDITABLE';

export type PermissionOverride = {
  code: string;
  effect: 'DENY' | 'GRANT';
};

export type RoleChangePlan = {
  added: readonly string[];
  removed: readonly string[];
};

export type OverrideChangePlan = {
  /** Exceptions to create, including the new side of a changed effect. */
  create: readonly PermissionOverride[];
  /** Codes whose active exception must be revoked first. */
  revoke: readonly string[];
};

const restrictedGrants = new Set<string>(administratorOnlyPermissionCodes);
const protectedFromDeny = new Set<string>(panelAccessPermissionCodes);

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function planRoleChange(
  current: readonly string[],
  desired: readonly string[],
): RoleChangePlan {
  const currentSet = new Set(current);
  const desiredSet = new Set(desired);
  return {
    added: sortedUnique(desired).filter((code) => !currentSet.has(code)),
    removed: sortedUnique(current).filter((code) => !desiredSet.has(code)),
  };
}

/**
 * The panel never assigns the ADMIN role to anyone nor removes it from anyone,
 * the administrator included: there is exactly one, and changing who it is
 * takes a new decision rather than a click.
 */
export function findRoleChangeViolation(
  plan: RoleChangePlan,
): UserAccessViolation | null {
  return plan.added.includes(administratorRoleCode) ||
    plan.removed.includes(administratorRoleCode)
    ? 'ADMIN_ROLE_NOT_EDITABLE'
    : null;
}

export function planOverrideChange(
  current: readonly PermissionOverride[],
  desired: readonly PermissionOverride[],
): OverrideChangePlan {
  const currentByCode = new Map(current.map((entry) => [entry.code, entry]));
  const desiredByCode = new Map(desired.map((entry) => [entry.code, entry]));

  const revoke = sortedUnique(
    current
      .filter(({ code, effect }) => desiredByCode.get(code)?.effect !== effect)
      .map(({ code }) => code),
  );
  const create = [...desiredByCode.values()]
    .filter(({ code, effect }) => currentByCode.get(code)?.effect !== effect)
    .sort((left, right) => left.code.localeCompare(right.code));
  return { create, revoke };
}

/**
 * Only newly created exceptions are judged, so an edit is never blocked by a
 * row the person already had. An administrator-only permission can be granted
 * only to the administrator, and the administrator can never be denied what
 * they need to reach the panel, or nobody could undo it.
 */
export function findOverrideChangeViolation(
  plan: OverrideChangePlan,
  targetIsAdministrator: boolean,
): UserAccessViolation | null {
  for (const { code, effect } of plan.create) {
    if (effect === 'GRANT' && restrictedGrants.has(code)) {
      if (!targetIsAdministrator) return 'ADMIN_PERMISSION_RESTRICTED';
    }
    if (effect === 'DENY' && protectedFromDeny.has(code)) {
      if (targetIsAdministrator) return 'ADMIN_ACCESS_PROTECTED';
    }
  }
  return null;
}

export function hasChanges(plan: RoleChangePlan | OverrideChangePlan): boolean {
  return 'added' in plan
    ? plan.added.length > 0 || plan.removed.length > 0
    : plan.create.length > 0 || plan.revoke.length > 0;
}
