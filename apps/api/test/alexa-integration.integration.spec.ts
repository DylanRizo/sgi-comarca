import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SessionService } from '../src/auth/application/session.service.js';
import { CsrfTokenService } from '../src/auth/http/csrf-token.service.js';
import { createApplication } from '../src/bootstrap.js';
import { runBootstrap } from '../../../packages/database/src/bootstrap/run-bootstrap.js';

const sharedDatabaseUrl = process.env.DATABASE_URL;
if (!sharedDatabaseUrl) {
  throw new Error('Integration database setup did not provide DATABASE_URL.');
}

const execFileAsync = promisify(execFile);
const host = 'localhost:3001';
const origin = 'http://localhost:3000';
const clientId = 'sgi-alexa-integration';
const clientSecret = Buffer.alloc(32, 0x73).toString('base64url');
const redirectUri = 'https://pitangui.amazon.com/api/skill/link/TESTVENDOR';
const verifier = 'v'.repeat(43);
const challenge = createHash('sha256')
  .update(verifier, 'ascii')
  .digest('base64url');

function quoteDatabaseName(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(value)) throw new Error('Unsafe name.');
  return `"${value}"`;
}

async function migrateDatabase(databaseUrl: string): Promise<void> {
  const databaseRoot = fileURLToPath(
    new URL('../../../packages/database/', import.meta.url),
  );
  await execFileAsync(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          '../../../packages/database/node_modules/prisma/build/index.js',
          import.meta.url,
        ),
      ),
      'migrate',
      'deploy',
      '--config',
      fileURLToPath(
        new URL('../../../packages/database/prisma.config.ts', import.meta.url),
      ),
    ],
    {
      cwd: databaseRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      maxBuffer: 1024 * 1024,
    },
  );
}

describe.sequential('Alexa account linking and real read bridge', () => {
  let administrator!: DatabaseClient;
  let client!: DatabaseClient;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let databaseName = '';
  let cookie = '';
  let csrfToken = '';
  let userId = '';
  const originalEnvironment = { ...process.env };

  beforeAll(async () => {
    const source = new URL(sharedDatabaseUrl);
    databaseName =
      'sgi_alexa_' +
      process.pid.toString() +
      '_' +
      randomUUID().replaceAll('-', '').slice(0, 12);
    const administratorUrl = new URL(source);
    administratorUrl.pathname = '/postgres';
    administratorUrl.searchParams.delete('schema');
    const isolatedUrl = new URL(source);
    isolatedUrl.pathname = `/${databaseName}`;
    isolatedUrl.searchParams.set('schema', 'public');

    administrator = createDatabaseClient(administratorUrl.toString());
    await administrator.$executeRawUnsafe(
      `CREATE DATABASE ${quoteDatabaseName(databaseName)}`,
    );
    await migrateDatabase(isolatedUrl.toString());
    process.env.DATABASE_URL = isolatedUrl.toString();
    process.env.AUTH_ORIGIN_HMAC_SECRET_BASE64 = Buffer.alloc(
      32,
      0x51,
    ).toString('base64');
    process.env.AUTH_CSRF_HMAC_SECRET_BASE64 = Buffer.alloc(32, 0x52).toString(
      'base64',
    );
    process.env.ALEXA_INTEGRATION_ENABLED = 'true';
    process.env.ALEXA_OAUTH_CLIENT_ID = clientId;
    process.env.ALEXA_OAUTH_CLIENT_SECRET_SHA256 = createHash('sha256')
      .update(clientSecret, 'utf8')
      .digest('hex');
    process.env.ALEXA_OAUTH_REDIRECT_URIS = redirectUri;

    client = createDatabaseClient(isolatedUrl.toString());
    await runBootstrap(client);
    const user = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'dylan' },
      select: { id: true },
    });
    userId = user.id;
    const now = new Date(Date.now() - 1_000);
    await client.user.update({
      where: { id: userId },
      data: {
        activatedAt: now,
        passwordCredential: {
          create: {
            createdAt: now,
            passwordChangedAt: now,
            passwordHash: 'controlled-integration-hash',
          },
        },
        status: 'ACTIVE',
      },
    });
    const rawSession = (
      await new SessionService(client).create(userId)
    ).revealOnce();
    cookie = `sgi_session=${rawSession}`;

    const unit = await client.unit.create({
      data: { code: 'UNIT', name: 'Unidades' },
    });
    const warehouse = await client.warehouse.findUniqueOrThrow({
      where: { code: 'CASA_DYLAN' },
    });
    const product = await client.product.create({
      data: {
        code: 'CAFE-REAL',
        name: 'Café molido real',
        unitId: unit.id,
      },
    });
    await client.inventoryBalance.create({
      data: {
        productId: product.id,
        quantity: '12.5',
        warehouseId: warehouse.id,
      },
    });
    await client.sale.create({
      data: {
        businessDate: new Date('2026-09-09T00:00:00.000Z'),
        currencyCode: 'NIO',
        deliveryPlace: 'must-not-be-spoken',
        items: {
          create: {
            lineSubtotal: '999.99',
            productId: product.id,
            quantity: '2',
            unitCostSnapshot: '100',
            unitPriceSnapshot: '200',
            warehouseId: warehouse.id,
          },
        },
        observations: 'must-not-be-spoken',
        origin: 'LEGACY_IMPORT',
        paymentMethodText: 'must-not-be-spoken',
        saleNumber: 'VTA-000000123',
        shippingAmount: '0',
        status: 'IN_TRANSIT',
        subtotal: '999.99',
        total: '999.99',
      },
    });

    app = await createApplication();
    await app.init();
    csrfToken = app.get(CsrfTokenService).create(rawSession);
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
    if (client) await client.$disconnect();
    if (administrator && databaseName) {
      await administrator.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS ${quoteDatabaseName(databaseName)} WITH (FORCE)`,
      );
      await administrator.$disconnect();
    }
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnvironment)) delete process.env[key];
    }
    Object.assign(process.env, originalEnvironment);
  });

  it('issues one-use PKCE tokens and reads only the voice-safe projection', async () => {
    const opaqueAlexaState = 's'.repeat(1024);
    const authorization = await request(app.getHttpServer())
      .post('/api/v1/alexa/oauth/authorize')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        approved: true,
        clientId,
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        redirectUri,
        responseType: 'code',
        scope: 'inventory.read sales.read',
        state: opaqueAlexaState,
      })
      .expect(200);
    const redirect = new URL(String(authorization.body.data.redirectUrl));
    const code = redirect.searchParams.get('code');
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(redirect.searchParams.get('state')).toBe(opaqueAlexaState);

    const token = await request(app.getHttpServer())
      .post('/api/v1/alexa/oauth/token')
      .set('Host', host)
      .type('form')
      .send({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      })
      .expect(200);
    expect(token.body).toMatchObject({
      expires_in: 900,
      scope: 'inventory.read sales.read',
      token_type: 'Bearer',
    });
    expect(token.body.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(token.body.refresh_token).toMatch(/^[A-Za-z0-9_-]{43}$/u);

    await request(app.getHttpServer())
      .post('/api/v1/alexa/oauth/token')
      .set('Host', host)
      .type('form')
      .send({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      })
      .expect(400);

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/alexa/oauth/token')
      .set('Host', host)
      .type('form')
      .send({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: token.body.refresh_token,
      })
      .expect(200);
    const accessToken = String(refreshed.body.access_token);
    expect(accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(refreshed.body.refresh_token).not.toBe(token.body.refresh_token);
    await request(app.getHttpServer())
      .post('/api/v1/alexa/oauth/token')
      .set('Host', host)
      .type('form')
      .send({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: token.body.refresh_token,
      })
      .expect(400);

    const inventory = await request(app.getHttpServer())
      .post('/api/v1/alexa/requests')
      .set('Host', host)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        request: {
          intent: {
            name: 'ConsultarExistenciasIntent',
            slots: {
              bodega: { value: 'Casa Dylan' },
              producto: { value: 'Café molido real' },
            },
          },
          locale: 'es-MX',
          type: 'IntentRequest',
        },
        version: '1.0',
      })
      .expect(200);
    expect(inventory.body.data.response.outputSpeech.text).toMatch(
      /Hay 12\.5 unidades/iu,
    );

    const sales = await request(app.getHttpServer())
      .post('/api/v1/alexa/requests')
      .set('Host', host)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        request: {
          intent: {
            name: 'ConsultarVentaEnTransitoIntent',
            slots: { numeroVenta: { value: '123' } },
          },
          locale: 'es-MX',
          type: 'IntentRequest',
        },
        version: '1.0',
      })
      .expect(200);
    const rendered = JSON.stringify(sales.body);
    expect(rendered).toContain('Café molido real');
    expect(rendered).not.toMatch(
      /999\.99|must-not-be-spoken|payment|precio|costo/iu,
    );
    expect(
      await client.auditLog.count({
        where: { action: 'ALEXA_READ_REQUESTED' },
      }),
    ).toBe(2);
    const queryAudits = await client.auditLog.findMany({
      where: { action: 'ALEXA_READ_REQUESTED' },
      select: { metadata: true },
    });
    expect(JSON.stringify(queryAudits)).not.toMatch(/Café|Casa Dylan|123/iu);

    for (let index = 0; index < 28; index += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/alexa/requests')
        .set('Host', host)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ request: { locale: 'es-MX', type: 'LaunchRequest' } })
        .expect(200);
    }
    await request(app.getHttpServer())
      .post('/api/v1/alexa/requests')
      .set('Host', host)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ request: { locale: 'es-MX', type: 'LaunchRequest' } })
      .expect(429);

    await request(app.getHttpServer())
      .post('/api/v1/alexa/oauth/revoke')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrfToken)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/alexa/requests')
      .set('Host', host)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ request: { locale: 'es-MX', type: 'LaunchRequest' } })
      .expect(401);
  }, 60_000);

  it('keeps the external endpoints protected by Host and bearer token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/alexa/requests')
      .set('Host', host)
      .send({ request: { locale: 'es-MX', type: 'LaunchRequest' } })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/alexa/oauth/token')
      .set('Host', 'evil.test')
      .type('form')
      .send({})
      .expect(403);
    expect(
      await client.alexaOAuthToken.findFirst({
        select: { tokenHash: true },
      }),
    ).toMatchObject({ tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/u) });
  });
});
