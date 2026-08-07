import { describe, expect, it } from 'vitest';

import type {
  AdminInvitationData,
  ApiSuccess,
  UserAdministrationPublicErrorCode,
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

  it('defines the four controlled administrative error codes', () => {
    const codes: UserAdministrationPublicErrorCode[] = [
      'ADMIN_OPERATION_CONFLICT',
      'ADMIN_USER_NOT_FOUND',
      'ADMIN_USER_STATE_CONFLICT',
      'LAST_ADMIN_PROTECTED',
    ];
    expect(codes).toHaveLength(4);
  });
});
