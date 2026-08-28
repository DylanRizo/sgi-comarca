import { Module } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import { SaleReadService } from './sale-read.service.js';
import { SalesController } from './sales.controller.js';

@Module({
  controllers: [SalesController],
  providers: [
    {
      provide: SaleReadService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider((client) => new SaleReadService(client)),
    },
  ],
  exports: [SaleReadService],
})
export class SalesModule {}
