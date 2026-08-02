import {
  ValidationPipe,
  VersioningType,
  type INestApplication,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './common/global-exception.filter.js';
import { appConfig } from './config/app.config.js';

export async function createApplication(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configuration = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  app.useLogger(app.get(Logger));
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
    credentials: true,
    origin: configuration.webOrigin,
  });
  app.enableShutdownHooks();

  if (configuration.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('SGI La Comarca API')
        .setDescription('Contratos técnicos de la base del monorepo.')
        .setVersion('1.0')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }

  return app;
}
