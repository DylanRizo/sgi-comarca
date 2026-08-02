import { describe, expect, it } from 'vitest';

import type { ApiSuccess, HealthData } from '../src/index.js';

describe('health contract', () => {
  it('keeps technical health data inside the shared response envelope', () => {
    const response: ApiSuccess<HealthData> = {
      data: {
        service: 'api',
        status: 'ok',
        timestamp: '2026-08-02T00:00:00.000Z',
      },
      meta: { requestId: 'request-id' },
    };

    expect(response.data.status).toBe('ok');
    expect(response.meta.requestId).toBe('request-id');
  });
});
