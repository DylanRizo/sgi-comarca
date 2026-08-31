import { Module } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import { InventoryAdjustmentService } from '../inventory/inventory-adjustment.service.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { InventoryCountLifecycleService } from './inventory-count-lifecycle.service.js';
import { InventoryCountSessionService } from './inventory-count-session.service.js';
import { InventoryCountsController } from './inventory-counts.controller.js';

@Module({
  imports: [InventoryModule],
  controllers: [InventoryCountsController],
  providers: [
    {
      provide: InventoryCountSessionService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new InventoryCountSessionService(client),
        ),
    },
    {
      provide: InventoryCountLifecycleService,
      inject: [DatabaseService, InventoryAdjustmentService],
      useFactory: (
        database: DatabaseService,
        adjustments: InventoryAdjustmentService,
      ) =>
        database.instantiateProvider(
          (client) => new InventoryCountLifecycleService(client, adjustments),
        ),
    },
  ],
  exports: [InventoryCountLifecycleService, InventoryCountSessionService],
})
export class InventoryCountsModule {}
