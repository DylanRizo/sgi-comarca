import { Module } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import { InventoryAdjustmentService } from './inventory-adjustment.service.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryMovementReadService } from './inventory-movement-read.service.js';
import { InventoryReadService } from './inventory-read.service.js';
import { InventoryTransferService } from './inventory-transfer.service.js';

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
      provide: InventoryMovementReadService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new InventoryMovementReadService(client),
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
    {
      provide: InventoryTransferService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new InventoryTransferService(client),
        ),
    },
  ],
  exports: [
    InventoryAdjustmentService,
    InventoryMovementReadService,
    InventoryReadService,
    InventoryTransferService,
  ],
})
export class InventoryModule {}
