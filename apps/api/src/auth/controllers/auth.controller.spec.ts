import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { ActivateAccountDto } from '../dto/activate-account.dto.js';
import { ChangePasswordDto } from '../dto/change-password.dto.js';
import { LoginDto } from '../dto/login.dto.js';

describe('authentication DTOs', () => {
  it('validates a canonical 32-byte activation token and code-point lengths', async () => {
    const valid = Object.assign(new ActivateAccountDto(), {
      password: 'calm river orchard lantern',
      token: Buffer.alloc(32, 0x31).toString('base64url'),
    });
    await expect(validate(valid)).resolves.toEqual([]);

    const malformed = Object.assign(new ActivateAccountDto(), {
      password: 'short',
      token: `${'A'.repeat(42)}B`,
    });
    const errors = await validate(malformed);
    expect(errors.map(({ property }) => property).sort()).toEqual([
      'password',
      'token',
    ]);
  });

  it('counts Unicode code points without trimming secrets', async () => {
    const login = Object.assign(new LoginDto(), {
      identifier: 'dylan',
      password: ` ${'x'.repeat(126)} `,
    });
    await expect(validate(login)).resolves.toEqual([]);

    login.password = ` ${'x'.repeat(127)} `;
    await expect(validate(login)).resolves.not.toEqual([]);

    const change = Object.assign(new ChangePasswordDto(), {
      currentPassword: '😀',
      newPassword: '😀'.repeat(12),
    });
    await expect(validate(change)).resolves.toEqual([]);
  });

  it('rejects identifiers longer than 64 code points instead of truncating', async () => {
    const input = Object.assign(new LoginDto(), {
      identifier: 'x'.repeat(65),
      password: 'controlled password',
    });
    const errors = await validate(input);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('identifier');
  });
});
