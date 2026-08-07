import { afterEach, describe, expect, it } from 'vitest';

import { appConfig } from './app.config.js';

const originalEnvironment = { ...process.env };

describe('API security configuration', () => {
  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnvironment)) delete process.env[key];
    }
    Object.assign(process.env, originalEnvironment);
  });

  it('uses local development cookie and proxy defaults', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.API_PUBLIC_URL;
    delete process.env.SESSION_COOKIE_NAME;
    delete process.env.TRUST_PROXY_HOPS;

    const result = appConfig();
    expect(result.sessionCookieName).toBe('sgi_session');
    expect(result.secureCookies).toBe(false);
    expect(result.trustProxyHops).toBe(0);
    expect(result.swaggerEnabled).toBe(false);
  });

  it('requires HTTPS, an explicit proxy count, and __Host cookie in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://unused';
    process.env.API_PUBLIC_URL = 'https://api.example.test';
    process.env.TRUST_PROXY_HOPS = '1';
    process.env.AUTH_CSRF_HMAC_SECRET_BASE64 = Buffer.alloc(32, 0x41).toString(
      'base64',
    );
    delete process.env.SESSION_COOKIE_NAME;

    const result = appConfig();
    expect(result.sessionCookieName).toBe('__Host-sgi_session');
    expect(result.secureCookies).toBe(true);
    expect(result.trustProxyHops).toBe(1);

    process.env.TRUST_PROXY_HOPS = '0';
    expect(() => appConfig()).toThrow(/TRUST_PROXY_HOPS/u);
    process.env.TRUST_PROXY_HOPS = '1';
    process.env.SESSION_COOKIE_NAME = 'sgi_session';
    expect(() => appConfig()).toThrow(/__Host-sgi_session/u);
  });
});
