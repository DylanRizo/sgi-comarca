import type { ConfigType } from '@nestjs/config';
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { appConfig } from '../../config/app.config.js';
import { CsrfTokenService } from './csrf-token.service.js';
import { OriginPolicyService } from './origin-policy.service.js';
import { SessionCookieService } from './session-cookie.service.js';

function configuration(
  overrides: Partial<ConfigType<typeof appConfig>> = {},
): ConfigType<typeof appConfig> {
  return {
    apiOrigin: 'http://localhost:3001',
    apiPort: 3001,
    csrfHmacSecret: Buffer.alloc(32, 0x7a),
    databaseUrl: 'postgresql://unused',
    expectedHost: 'localhost:3001',
    logLevel: 'silent',
    nodeEnvironment: 'test',
    secureCookies: false,
    sessionCookieName: 'sgi_session',
    swaggerEnabled: false,
    swaggerRequested: false,
    trustProxyHops: 0,
    webOrigins: ['http://localhost:3000'],
    ...overrides,
  } as ConfigType<typeof appConfig>;
}

function request(headers: Record<string, string>, method = 'GET'): Request {
  return {
    header: (name: string) => headers[name.toLowerCase()],
    method,
  } as Request;
}

describe('BLOQUE 4 HTTP security services', () => {
  afterEach(() => vi.useRealTimers());

  it('derives a versioned CSRF token and compares it without accepting changes', () => {
    const service = new CsrfTokenService(configuration());
    const sessionToken = Buffer.alloc(32, 0x33).toString('base64url');
    const token = service.create(sessionToken);

    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]{43}$/u);
    expect(service.verify(sessionToken, token)).toBe(true);
    expect(service.verify(sessionToken + 'x', token)).toBe(false);
    expect(service.verify(sessionToken, token.slice(0, -1) + 'A')).toBe(false);
  });

  it('requires exact Host and Origin according to request safety', () => {
    const service = new OriginPolicyService(configuration());

    expect(() =>
      service.assertRequestAllowed(request({ host: 'localhost:3001' })),
    ).not.toThrow();
    expect(() =>
      service.assertRequestAllowed(
        request(
          { host: 'localhost:3001', origin: 'http://localhost:3000' },
          'POST',
        ),
      ),
    ).not.toThrow();
    expect(() =>
      service.assertRequestAllowed(request({ host: 'evil.test' })),
    ).toThrow();
    expect(() =>
      service.assertRequestAllowed(request({ host: 'localhost:3001' }, 'POST')),
    ).toThrow();
    expect(() =>
      service.assertRequestAllowed(
        request({ host: 'localhost:3001', origin: 'null' }, 'POST'),
      ),
    ).toThrow();
    expect(() =>
      service.assertRequestAllowed(
        request(
          { host: 'localhost:3001', origin: 'http://localhost:3000.evil.test' },
          'POST',
        ),
      ),
    ).toThrow();
  });

  it('uses matching secure attributes for writing and clearing cookies', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const service = new SessionCookieService(
      configuration({
        secureCookies: true,
        sessionCookieName: '__Host-sgi_session',
      }),
    );
    const cookie = vi.fn();
    const clearCookie = vi.fn();
    const setHeader = vi.fn();
    const response = { clearCookie, cookie, setHeader } as unknown as Response;

    service.write(response, 'opaque-session', {
      absoluteExpiresAt: new Date('2030-01-01T08:00:00.000Z'),
      idleExpiresAt: new Date('2030-01-01T00:30:00.000Z'),
      lastSeenAt: new Date('2030-01-01T00:00:00.000Z'),
      sessionId: 'session-id',
      userId: 'user-id',
    });
    service.clear(response);

    expect(cookie).toHaveBeenCalledWith(
      '__Host-sgi_session',
      'opaque-session',
      expect.objectContaining({
        httpOnly: true,
        maxAge: 30 * 60 * 1000,
        path: '/',
        sameSite: 'lax',
        secure: true,
      }),
    );
    expect(clearCookie).toHaveBeenCalledWith(
      '__Host-sgi_session',
      expect.objectContaining({
        httpOnly: true,
        maxAge: 0,
        path: '/',
        sameSite: 'lax',
        secure: true,
      }),
    );
  });
});
