import { ValidationPipe, VersioningType, type Type } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './common/global-exception.filter.js';
import { appConfig } from './config/app.config.js';

export async function createApplication(
  rootModule: Type<unknown> = AppModule,
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(rootModule, {
    bufferLogs: true,
  });
  const configuration = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  app.useLogger(app.get(Logger));
  app.set('trust proxy', configuration.trustProxyHops || false);
  app.use(helmet());
  app.use(cookieParser());
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
