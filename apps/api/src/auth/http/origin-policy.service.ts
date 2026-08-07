import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { Request } from 'express';

import { appConfig } from '../../config/app.config.js';
import { AuthHttpException } from './auth-http.exception.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class OriginPolicyService {
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(
    @Inject(appConfig.KEY)
    private readonly configuration: ConfigType<typeof appConfig>,
  ) {
    this.allowedOrigins = new Set(configuration.webOrigins);
  }

  assertRequestAllowed(request: Request): void {
    const host = request.header('host')?.toLowerCase();
    if (host !== this.configuration.expectedHost) {
      throw AuthHttpException.requestVerificationFailed();
    }

    const origin = request.header('origin');
    if (!origin) {
      if (safeMethods.has(request.method.toUpperCase())) return;
      throw AuthHttpException.requestVerificationFailed();
    }

    if (
      origin === 'null' ||
      !this.allowedOrigins.has(this.canonicalOrigin(origin))
    ) {
      throw AuthHttpException.requestVerificationFailed();
    }
  }

  canonicalRequestOrigin(request: Request): string {
    this.assertRequestAllowed(request);
    const origin = request.header('origin');
    if (!origin) throw AuthHttpException.requestVerificationFailed();
    const canonical = this.canonicalOrigin(origin);
    if (!canonical || !this.allowedOrigins.has(canonical)) {
      throw AuthHttpException.requestVerificationFailed();
    }
    return canonical;
  }

  isCorsOriginAllowed(origin: string | undefined): boolean {
    return (
      origin === undefined ||
      this.allowedOrigins.has(this.canonicalOrigin(origin))
    );
  }

  private canonicalOrigin(value: string): string {
    try {
      const url = new URL(value);
      if (
        (url.protocol !== 'http:' && url.protocol !== 'https:') ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      ) {
        return '';
      }
      return url.origin;
    } catch {
      return '';
    }
  }
}
