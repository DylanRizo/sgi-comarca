import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseService } from '../database/database.service.js';
import { AnalyticsReadService } from './analytics-read.service.js';
import { AnalyticsController } from './analytics.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController],
  providers: [
    {
      provide: AnalyticsReadService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new AnalyticsReadService(client),
        ),
    },
  ],
  exports: [AnalyticsReadService],
})
export class AnalyticsModule {}
