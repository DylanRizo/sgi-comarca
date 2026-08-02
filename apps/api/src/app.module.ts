import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { appConfig } from './config/app.config.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      load: [appConfig],
    }),
    LoggerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (configuration: ConfigType<typeof appConfig>) => ({
        pinoHttp: {
          level: configuration.logLevel,
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers.set-cookie',
          ],
        },
      }),
    }),
    DatabaseModule,
    HealthModule,
  ],
})
export class AppModule {}
