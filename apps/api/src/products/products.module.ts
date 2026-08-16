import { Module } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import { ProductReadService } from './product-read.service.js';
import { ProductsController } from './products.controller.js';

@Module({
  controllers: [ProductsController],
  providers: [
    {
      provide: ProductReadService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new ProductReadService(client),
        ),
    },
  ],
  exports: [ProductReadService],
})
export class ProductsModule {}
