import { Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { ProductWriteService } from '../products/product-write.service.js';
import { ProductCatalogService } from '../products/product-catalog.service.js';
import { InventoryValuationService } from './inventory-valuation.service.js';
import { StockReceiptService } from './stock-receipt.service.js';
import {
  InventoryValuationsController,
  ProductCommandsController,
  ProductGroupsController,
  StockReceiptsController,
} from './stock-operations.controller.js';

@Module({
  controllers: [
    ProductCommandsController,
    ProductGroupsController,
    StockReceiptsController,
    InventoryValuationsController,
  ],
  providers: [
    {
      provide: StockReceiptService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new StockReceiptService(client),
        ),
    },
    {
      provide: ProductWriteService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new ProductWriteService(client),
        ),
    },
    {
      provide: ProductCatalogService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new ProductCatalogService(client),
        ),
    },
    {
      provide: InventoryValuationService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new InventoryValuationService(client),
        ),
    },
  ],
})
export class StockReceiptsModule {}
