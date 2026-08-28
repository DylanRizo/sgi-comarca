import { Module } from '@nestjs/common';

import { CreateSaleService } from './create-sale.service.js';
import { DatabaseService } from '../database/database.service.js';
import { SaleReadService } from './sale-read.service.js';
import { SalesController } from './sales.controller.js';

@Module({
  controllers: [SalesController],
  providers: [
    {
      provide: CreateSaleService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider((client) => new CreateSaleService(client)),
    },
    {
      provide: SaleReadService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider((client) => new SaleReadService(client)),
    },
  ],
  exports: [CreateSaleService, SaleReadService],
})
export class SalesModule {}
