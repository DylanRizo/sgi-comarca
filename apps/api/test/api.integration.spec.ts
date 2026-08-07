import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap.js';

describe('technical endpoints', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports process health', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Host', 'localhost:3001')
      .expect(200);

    expect(response.body).toMatchObject({
      data: { service: 'api', status: 'ok' },
    });
  });

  it('reports PostgreSQL readiness', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/ready')
      .set('Host', 'localhost:3001')
      .expect(200);

    expect(response.body).toMatchObject({
      data: {
        checks: { database: 'up' },
        service: 'api',
        status: 'ready',
      },
    });
  });
});
