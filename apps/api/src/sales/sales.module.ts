import { Module } from '@nestjs/common';

import { CreateSaleService } from './create-sale.service.js';
import { DatabaseService } from '../database/database.service.js';
import { SaleLifecycleService } from './sale-lifecycle.service.js';
import { SaleReadService } from './sale-read.service.js';
import { SalesController } from './sales.controller.js';
import { VoidDuplicateSaleService } from './void-duplicate-sale.service.js';

@Module({
  controllers: [SalesController],
  providers: [
    {
      provide: VoidDuplicateSaleService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new VoidDuplicateSaleService(client),
        ),
    },
    {
      provide: CreateSaleService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider((client) => new CreateSaleService(client)),
    },
    {
      provide: SaleLifecycleService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new SaleLifecycleService(client),
        ),
    },
    {
      provide: SaleReadService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider((client) => new SaleReadService(client)),
    },
  ],
  exports: [
    CreateSaleService,
    SaleLifecycleService,
    SaleReadService,
    VoidDuplicateSaleService,
  ],
})
export class SalesModule {}
