import { Module } from '@nestjs/common';

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
      provide: FinanceReadService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new FinanceReadService(client),
        ),
    },
  ],
  exports: [FinanceReadService],
})
export class FinancesModule {}
