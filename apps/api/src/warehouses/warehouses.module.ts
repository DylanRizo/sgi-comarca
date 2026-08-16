import { Module } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import { WarehouseReadService } from './warehouse-read.service.js';
import { WarehousesController } from './warehouses.controller.js';

@Module({
  controllers: [WarehousesController],
  providers: [
    {
      provide: WarehouseReadService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new WarehouseReadService(client),
        ),
    },
  ],
  exports: [WarehouseReadService],
})
export class WarehousesModule {}
