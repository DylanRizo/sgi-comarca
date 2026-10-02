import { describe, expect, it } from 'vitest';

import {
  administratorOnlyPermissionCodes,
  administratorRoleCode,
  panelAccessPermissionCodes,
  type AdminInvitationData,
  type ApiSuccess,
  type UserAdministrationPublicErrorCode,
} from '../src/index.js';

describe('user administration contracts', () => {
  it('exposes only the one-time invitation token', () => {
    const response: ApiSuccess<AdminInvitationData> = {
      data: { token: 'controlled-opaque-token' },
      meta: { requestId: 'controlled-request-id' },
    };
    expect(Object.keys(response.data)).toEqual(['token']);
    expect(response.data).not.toHaveProperty('url');
    expect(response.data).not.toHaveProperty('tokenHash');
  });

  it('defines the controlled administrative error codes', () => {
    const codes: UserAdministrationPublicErrorCode[] = [
      'ADMIN_ACCESS_PROTECTED',
      'ADMIN_OPERATION_CONFLICT',
      'ADMIN_PERMISSION_RESTRICTED',
      'ADMIN_ROLE_NOT_EDITABLE',
      'ADMIN_UNKNOWN_CODE',
      'ADMIN_USER_NOT_FOUND',
      'ADMIN_USER_STATE_CONFLICT',
      'LAST_ADMIN_PROTECTED',
    ];
    expect(codes).toHaveLength(8);
  });

  it('keeps panel access inside the administrator-only permissions', () => {
    // ADR-018: the permissions the administrator cannot be denied are a subset
    // of the ones nobody else may be granted, or the two rules would disagree.
    for (const code of panelAccessPermissionCodes) {
      expect(administratorOnlyPermissionCodes).toContain(code);
    }
    expect(administratorRoleCode).toBe('ADMIN');
  });
});
