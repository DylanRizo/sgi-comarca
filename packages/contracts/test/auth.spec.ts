import { describe, expect, it } from 'vitest';

import type {
  ActivateAccountRequest,
  ApiSuccess,
  AuthPublicErrorCode,
  AuthenticationData,
  ChangePasswordRequest,
  CurrentSessionData,
  LoginRequest,
} from '../src/index.js';

describe('authentication HTTP contracts', () => {
  it('exposes only stable public session fields', () => {
    const response: ApiSuccess<AuthenticationData> = {
      data: {
        csrfToken: 'controlled-csrf-token',
        session: {
          absoluteExpiresAt: '2026-08-07T02:00:00.000Z',
          idleExpiresAt: '2026-08-06T18:30:00.000Z',
        },
        user: {
          displayName: 'Controlled user',
          id: '00000000-0000-0000-0000-000000000001',
          identifier: 'controlled',
          status: 'ACTIVE',
        },
      },
      meta: { requestId: 'controlled-request-id' },
    };

    expect(Object.keys(response.data.user).sort()).toEqual([
      'displayName',
      'id',
      'identifier',
      'status',
    ]);
    expect(response.data).not.toHaveProperty('token');
    expect(response.data.user).not.toHaveProperty('roles');
  });

  it('keeps effective permissions informational and omits internal roles', () => {
    const session: CurrentSessionData = {
      absoluteExpiresAt: '2026-08-07T02:00:00.000Z',
      displayName: 'Controlled user',
      identifier: 'controlled',
      idleExpiresAt: '2026-08-06T18:30:00.000Z',
      permissions: ['sales.create'],
      status: 'ACTIVE',
      userId: '00000000-0000-0000-0000-000000000001',
    };

    expect(session.permissions).toEqual(['sales.create']);
    expect(session).not.toHaveProperty('roles');
    expect(session).not.toHaveProperty('passwordHash');
  });

  it('defines public request bodies without internal authentication fields', () => {
    const activation: ActivateAccountRequest = {
      password: 'controlled passphrase',
      token: 'controlled-token',
    };
    const login: LoginRequest = {
      identifier: 'controlled',
      password: 'controlled passphrase',
    };
    const change: ChangePasswordRequest = {
      currentPassword: 'controlled passphrase',
      newPassword: 'another controlled passphrase',
    };
    const publicCode: AuthPublicErrorCode = 'AUTHENTICATION_FAILED';

    expect({ activation, change, login, publicCode }).not.toHaveProperty(
      'passwordHash',
    );
  });
});
