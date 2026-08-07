import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { AuthAuditService } from '../application/auth-audit.service.js';
import { LastAdminPolicyError } from '../application/last-admin-policy.js';
import { UserAdministrationError } from '../application/user-administration.service.js';
import { REQUIRED_PERMISSION_METADATA } from '../decorators/require-permission.decorator.js';
import { EmptyAdminCommandDto } from '../dto/admin-user-command.dto.js';
import { UserIdParamDto } from '../dto/user-id-param.dto.js';
import { AuthHttpException } from '../http/auth-http.exception.js';
import { SecretToken } from '../infrastructure/auth-token.service.js';
import {
  mapUserAdministrationError,
  UserAdministrationController,
} from './user-administration.controller.js';

describe('user administration HTTP boundary', () => {
  it('validates UUID parameters and rejects every body property', async () => {
    const valid = Object.assign(new UserIdParamDto(), {
      id: '00000000-0000-4000-8000-000000000001',
    });
    await expect(validate(valid)).resolves.toEqual([]);

    const invalid = Object.assign(new UserIdParamDto(), { id: 'not-a-uuid' });
    await expect(validate(invalid)).resolves.not.toEqual([]);

    const pipe = new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    });
    await expect(
      pipe.transform(
        { unexpected: true },
        { metatype: EmptyAdminCommandDto, type: 'body' },
      ),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    await expect(
      pipe.transform({}, { metatype: EmptyAdminCommandDto, type: 'body' }),
    ).resolves.toBeInstanceOf(EmptyAdminCommandDto);
  });

  it('declares exactly one approved permission per endpoint', () => {
    const prototype = UserAdministrationController.prototype;
    const required = (method: keyof UserAdministrationController) =>
      Reflect.getMetadata(
        REQUIRED_PERMISSION_METADATA,
        prototype[method] as object,
      );

    expect(required('createInvitation')).toBe('users.invitations.create');
    expect(required('revokeCredential')).toBe('users.credentials.revoke');
    expect(required('revokeSessions')).toBe('users.sessions.revoke');
    expect(required('deactivateUser')).toBe('users.status.manage');
  });

  it('maps controlled domain failures without leaking internal messages', () => {
    for (const [error, status, code] of [
      [
        new UserAdministrationError('ADMIN_USER_NOT_FOUND'),
        404,
        'ADMIN_USER_NOT_FOUND',
      ],
      [
        new UserAdministrationError('ADMIN_USER_STATE_CONFLICT'),
        409,
        'ADMIN_USER_STATE_CONFLICT',
      ],
      [
        new UserAdministrationError('ADMIN_OPERATION_CONFLICT'),
        409,
        'ADMIN_OPERATION_CONFLICT',
      ],
      [
        new LastAdminPolicyError('internal detail'),
        409,
        'LAST_ADMIN_PROTECTED',
      ],
    ] as const) {
      try {
        mapUserAdministrationError(error);
        throw new Error('Expected a mapped exception.');
      } catch (mapped) {
        expect(mapped).toBeInstanceOf(AuthHttpException);
        expect((mapped as AuthHttpException).getStatus()).toBe(status);
        expect((mapped as AuthHttpException).publicCode).toBe(code);
        expect((mapped as Error).message).not.toContain('internal detail');
      }
    }
  });

  it('reveals an administrative invitation token only once', () => {
    const secret = new SecretToken('controlled-administrative-token');
    expect(secret.revealOnce()).toBe('controlled-administrative-token');
    expect(() => secret.revealOnce()).toThrow('already been revealed');
    expect(JSON.stringify(secret)).not.toContain(
      'controlled-administrative-token',
    );
  });

  it('rejects sensitive administrative audit metadata keys', async () => {
    const audit = new AuthAuditService();
    const transaction = {
      auditLog: { create: () => Promise.resolve() },
    };
    for (const key of [
      'token',
      'tokenHash',
      'passwordHash',
      'cookie',
      'csrf',
      'origin',
      'credential',
      'session',
    ]) {
      await expect(
        audit.record(transaction as never, {
          action: 'ADMIN_INVITATION_CREATED',
          metadata: { [key]: 'controlled-sensitive-value' },
          occurredAt: new Date(0),
        }),
      ).rejects.toThrow('contains a secret key');
    }
  });
});
