import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module.js';
import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import { appConfig } from '../config/app.config.js';
import { DatabaseService } from '../database/database.service.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { InventoryReadService } from '../inventory/inventory-read.service.js';
import { ProductsModule } from '../products/products.module.js';
import { ProductReadService } from '../products/product-read.service.js';
import { SalesModule } from '../sales/sales.module.js';
import { SaleReadService } from '../sales/sale-read.service.js';
import { WarehousesModule } from '../warehouses/warehouses.module.js';
import { WarehouseReadService } from '../warehouses/warehouse-read.service.js';
import { AlexaAccessTokenGuard } from './alexa-access-token.guard.js';
import { AlexaOAuthController } from './alexa-oauth.controller.js';
import { AlexaOAuthService } from './alexa-oauth.service.js';
import { AlexaRequestController } from './alexa-request.controller.js';
import { AlexaRequestService } from './alexa-request.service.js';

@Module({
  imports: [
    AuthModule,
    ProductsModule,
    WarehousesModule,
    InventoryModule,
    SalesModule,
  ],
  controllers: [AlexaOAuthController, AlexaRequestController],
  providers: [
    {
      provide: AlexaOAuthService,
      inject: [DatabaseService, appConfig.KEY, EffectivePermissionsService],
      useFactory: (
        database: DatabaseService,
        configuration: ConfigType<typeof appConfig>,
        permissions: EffectivePermissionsService,
      ) =>
        database.instantiateProvider(
          (client) => new AlexaOAuthService(client, configuration, permissions),
        ),
    },
    {
      provide: AlexaRequestService,
      inject: [
        ProductReadService,
        WarehouseReadService,
        InventoryReadService,
        SaleReadService,
        AlexaOAuthService,
      ],
      useFactory: (
        products: ProductReadService,
        warehouses: WarehouseReadService,
        inventory: InventoryReadService,
        sales: SaleReadService,
        oauth: AlexaOAuthService,
      ) =>
        new AlexaRequestService(products, warehouses, inventory, sales, oauth),
    },
    AlexaAccessTokenGuard,
  ],
})
export class AlexaModule {}
