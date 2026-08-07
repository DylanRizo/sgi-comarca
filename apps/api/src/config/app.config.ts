import { registerAs } from '@nestjs/config';
import { randomBytes } from 'node:crypto';

const developmentDatabaseUrl =
  'postgresql://sgi_dev:sgi_dev_password@localhost:5433/sgi_comarca_dev?schema=public';

function parsePort(value: string | undefined): number {
  const port = Number(value ?? '3001');

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('API_PORT must be an integer between 1 and 65535.');
  }

  return port;
}

function parseBoolean(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true';
}

function parseNonNegativeInteger(
  value: string | undefined,
  name: string,
  fallback: number,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 16) {
    throw new Error(`${name} must be an integer between 0 and 16.`);
  }
  return parsed;
}

function parseOrigin(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must contain an absolute URL.`);
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${name} must be an HTTP(S) origin without credentials, path, query or fragment.`,
    );
  }

  return url.origin;
}

function parseWebOrigins(value: string | undefined): readonly string[] {
  const candidates = (value ?? 'http://localhost:3000')
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  if (candidates.length === 0) {
    throw new Error('WEB_ORIGINS must contain at least one origin.');
  }
  return Object.freeze([
    ...new Set(
      candidates.map((candidate, index) =>
        parseOrigin(candidate, `WEB_ORIGINS[${index}]`),
      ),
    ),
  ]);
}

function parseCsrfSecret(
  encoded: string | undefined,
  nodeEnvironment: string,
): Buffer {
  if (!encoded) {
    if (nodeEnvironment === 'production') {
      throw new Error(
        'AUTH_CSRF_HMAC_SECRET_BASE64 is required in production.',
      );
    }
    return randomBytes(32);
  }

  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      encoded,
    )
  ) {
    throw new Error('AUTH_CSRF_HMAC_SECRET_BASE64 must be canonical Base64.');
  }
  const secret = Buffer.from(encoded, 'base64');
  if (secret.length < 32 || secret.toString('base64') !== encoded) {
    throw new Error(
      'AUTH_CSRF_HMAC_SECRET_BASE64 must decode to at least 32 bytes.',
    );
  }
  return secret;
}

function sessionCookieName(nodeEnvironment: string): string {
  const configured = process.env.SESSION_COOKIE_NAME;
  if (nodeEnvironment === 'production') {
    if (configured && configured !== '__Host-sgi_session') {
      throw new Error(
        'SESSION_COOKIE_NAME must be __Host-sgi_session in production.',
      );
    }
    return '__Host-sgi_session';
  }

  const name = configured ?? 'sgi_session';
  if (
    name.startsWith('__Host-') ||
    !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name)
  ) {
    throw new Error(
      'SESSION_COOKIE_NAME must be a valid non-__Host cookie name outside production.',
    );
  }
  return name;
}

function databaseUrl(nodeEnvironment: string): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  if (nodeEnvironment === 'production') {
    throw new Error('DATABASE_URL is required in production.');
  }

  return developmentDatabaseUrl;
}

export const appConfig = registerAs('app', () => {
  const nodeEnvironment = process.env.NODE_ENV ?? 'development';
  const apiOrigin = parseOrigin(
    process.env.API_PUBLIC_URL ?? 'http://localhost:3001',
    'API_PUBLIC_URL',
  );
  const apiUrl = new URL(apiOrigin);
  const trustProxyHops = parseNonNegativeInteger(
    process.env.TRUST_PROXY_HOPS,
    'TRUST_PROXY_HOPS',
    0,
  );
  if (nodeEnvironment === 'production') {
    if (process.env.TRUST_PROXY_HOPS === undefined || trustProxyHops === 0) {
      throw new Error(
        'TRUST_PROXY_HOPS must be an explicit positive integer in production.',
      );
    }
    if (apiUrl.protocol !== 'https:') {
      throw new Error('API_PUBLIC_URL must use HTTPS in production.');
    }
  } else if (
    apiUrl.protocol === 'http:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(apiUrl.hostname)
  ) {
    throw new Error(
      'Insecure development cookies are allowed only on local HTTP.',
    );
  }

  return {
    apiPort: parsePort(process.env.API_PORT),
    apiOrigin,
    csrfHmacSecret: parseCsrfSecret(
      process.env.AUTH_CSRF_HMAC_SECRET_BASE64,
      nodeEnvironment,
    ),
    databaseUrl: databaseUrl(nodeEnvironment),
    expectedHost: apiUrl.host.toLowerCase(),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    nodeEnvironment,
    secureCookies: apiUrl.protocol === 'https:',
    sessionCookieName: sessionCookieName(nodeEnvironment),
    // Swagger remains intentionally disabled until it has an authenticated gate.
    swaggerEnabled: false,
    swaggerRequested: parseBoolean(process.env.SWAGGER_ENABLED ?? 'false'),
    trustProxyHops,
    webOrigins: parseWebOrigins(
      process.env.WEB_ORIGINS ?? process.env.WEB_ORIGIN,
    ),
  };
});
