import type {
  ApiErrorBody,
  ApiSuccess,
  AuthPublicErrorCode,
} from '@sgi/contracts';

import { publicApiUrl } from '@/lib/environment';

export type ApiRequestOptions = {
  body?: unknown;
  csrfToken?: string;
  method?: 'GET' | 'POST';
  signal?: AbortSignal;
};

export class ApiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: AuthPublicErrorCode | 'HTTP_ERROR',
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiHttpError';
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== 'object' || !('error' in value)) return false;
  const error = value.error;
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string' &&
    'requestId' in error &&
    typeof error.requestId === 'string',
  );
}

function isApiSuccess<T>(value: unknown): value is ApiSuccess<T> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'data' in value &&
    'meta' in value &&
    value.meta &&
    typeof value.meta === 'object' &&
    'requestId' in value.meta &&
    typeof value.meta.requestId === 'string',
  );
}

async function parseJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  if (!path.startsWith('/')) throw new Error('API paths must be absolute.');

  const headers = new Headers({
    Accept: 'application/json',
    'X-Request-ID': crypto.randomUUID(),
  });
  if (options.body !== undefined)
    headers.set('Content-Type', 'application/json');
  if (options.csrfToken) headers.set('X-CSRF-Token', options.csrfToken);

  const response = await fetch(`${publicApiUrl()}${path}`, {
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
    credentials: 'include',
    headers,
    method: options.method ?? 'GET',
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (response.status === 204) {
    if (!response.ok) {
      throw new ApiHttpError(response.status, 'HTTP_ERROR', 'HTTP error.');
    }
    return undefined as T;
  }

  const parsed = await parseJson(response);
  if (!response.ok) {
    if (isApiErrorBody(parsed)) {
      throw new ApiHttpError(
        response.status,
        parsed.error.code as AuthPublicErrorCode,
        parsed.error.message,
        parsed.error.requestId,
      );
    }
    throw new ApiHttpError(response.status, 'HTTP_ERROR', 'HTTP error.');
  }

  if (!isApiSuccess<T>(parsed)) {
    throw new ApiHttpError(
      response.status,
      'HTTP_ERROR',
      'Invalid API response.',
    );
  }
  return parsed.data;
}
