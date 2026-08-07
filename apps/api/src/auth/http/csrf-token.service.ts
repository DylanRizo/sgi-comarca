import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { appConfig } from '../../config/app.config.js';

const version = 'v1';

@Injectable()
export class CsrfTokenService {
  constructor(
    @Inject(appConfig.KEY)
    private readonly configuration: ConfigType<typeof appConfig>,
  ) {}

  create(sessionToken: string): string {
    const signature = this.signature(sessionToken);
    return `${version}.${signature.toString('base64url')}`;
  }

  verify(sessionToken: string, candidate: string | undefined): boolean {
    if (!candidate?.startsWith(`${version}.`)) return false;
    const encoded = candidate.slice(version.length + 1);
    if (!/^[A-Za-z0-9_-]{43}$/u.test(encoded)) return false;

    const supplied = Buffer.from(encoded, 'base64url');
    const expected = this.signature(sessionToken);
    return (
      supplied.length === expected.length && timingSafeEqual(supplied, expected)
    );
  }

  private signature(sessionToken: string): Buffer {
    return createHmac('sha256', this.configuration.csrfHmacSecret)
      .update(`${version}\0${sessionToken}`, 'utf8')
      .digest();
  }
}
