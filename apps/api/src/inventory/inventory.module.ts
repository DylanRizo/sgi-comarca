import { Module } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryReadService } from './inventory-read.service.js';

@Module({
  controllers: [InventoryController],
  providers: [
    {
      provide: InventoryReadService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new InventoryReadService(client),
        ),
    },
  ],
  exports: [InventoryReadService],
})
export class InventoryModule {}
