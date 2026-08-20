import { Module } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import { InventoryAdjustmentService } from './inventory-adjustment.service.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryReadService } from './inventory-read.service.js';

@Module({
  controllers: [InventoryController],
  providers: [
    {
      provide: InventoryAdjustmentService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new InventoryAdjustmentService(client),
        ),
    },
    {
      provide: InventoryReadService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new InventoryReadService(client),
        ),
    },
  ],
  exports: [InventoryAdjustmentService, InventoryReadService],
})
export class InventoryModule {}
