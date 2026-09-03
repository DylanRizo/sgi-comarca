import { Module } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';

import { appConfig } from '../config/app.config.js';

import { CreateFinancialEntryService } from './create-financial-entry.service.js';
import { ClosingPreviewService } from './closing-preview.service.js';
import { DailyClosingService } from './daily-closing.service.js';
import { DatabaseService } from '../database/database.service.js';
import { FinanceReadService } from './finance-read.service.js';
import {
  DailyClosingsController,
  FinancesController,
} from './finances.controller.js';

@Module({
  controllers: [FinancesController, DailyClosingsController],
  providers: [
    {
      provide: CreateFinancialEntryService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new CreateFinancialEntryService(client),
        ),
    },
    {
      provide: DailyClosingService,
      inject: [DatabaseService, appConfig.KEY],
      useFactory: (
        database: DatabaseService,
        configuration: ConfigType<typeof appConfig>,
      ) =>
        database.instantiateProvider(
          (client) =>
            new DailyClosingService(client, {
              reopeningWindowDays: configuration.closingReopeningWindowDays,
              tolerance: configuration.closingTolerance,
            }),
        ),
    },
    {
      provide: ClosingPreviewService,
      inject: [DatabaseService, appConfig.KEY],
      useFactory: (
        database: DatabaseService,
        configuration: ConfigType<typeof appConfig>,
      ) =>
        database.instantiateProvider(
          (client) =>
            // The same tolerance the closing applies, so the live balance the
            // screen shows cannot disagree with the recorded result.
            new ClosingPreviewService(client, configuration.closingTolerance),
        ),
    },
    {
      provide: FinanceReadService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new FinanceReadService(client),
        ),
    },
  ],
  exports: [
    ClosingPreviewService,
    CreateFinancialEntryService,
    DailyClosingService,
    FinanceReadService,
  ],
})
export class FinancesModule {}
