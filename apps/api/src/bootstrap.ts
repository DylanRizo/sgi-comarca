import { ValidationPipe, VersioningType, type Type } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { IncomingMessage } from 'node:http';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './common/global-exception.filter.js';
import { appConfig } from './config/app.config.js';

const MARKETPLACE_BOT_SYNC_PATH = '/api/v1/integrations/marketplace-bot/sync';
/**
 * The heartbeat carries the bot's whole snapshot, which outgrows the default
 * 100 kB once a few hundred listings are active. The API bounds every list
 * after parsing, so the larger allowance exists only on that one route.
 */
const MARKETPLACE_BOT_SYNC_BODY_LIMIT = '1mb';

function isMarketplaceBotSync(request: IncomingMessage): boolean {
  const path = (request.url ?? '').split('?')[0];
  return (
    request.method === 'POST' &&
    path === MARKETPLACE_BOT_SYNC_PATH &&
    /^application\/json\b/iu.test(request.headers['content-type'] ?? '')
  );
}

export async function createApplication(
  rootModule: Type<unknown> = AppModule,
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(rootModule, {
    // The parsers are registered explicitly below, in a fixed order.
    bodyParser: false,
    bufferLogs: true,
  });
  const configuration = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  app.useLogger(app.get(Logger));
  app.set('trust proxy', configuration.trustProxyHops || false);
  app.use(helmet());
  app.use(cookieParser());
  // The first parser reads only the heartbeat. The other two are the ones
  // Nest would add by itself, with its defaults, so every other route keeps
  // the 100 kB limit.
  app.useBodyParser('json', {
    limit: MARKETPLACE_BOT_SYNC_BODY_LIMIT,
    type: isMarketplaceBotSync,
  });
  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });
  app.setGlobalPrefix('api');
  app.enableVersioning({
    defaultVersion: '1',
    type: VersioningType.URI,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableCors({
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'X-CSRF-Token',
      'X-Request-ID',
      'Idempotency-Key',
    ],
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin: (origin, callback) => {
      if (!origin || configuration.webOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      // The OriginGuard produces the uniform 403; CORS only withholds headers.
      callback(null, false);
    },
  });
  app.enableShutdownHooks();

  // OpenAPI is intentionally not mounted until it has an authenticated gate.
  return app;
}
