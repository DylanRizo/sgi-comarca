import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module.js';
import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import { appConfig } from '../config/app.config.js';
import { DatabaseService } from '../database/database.service.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { InventoryReadService } from '../inventory/inventory-read.service.js';
import { IntegrationCatalogController } from './integration-catalog.controller.js';
import { IntegrationCatalogService } from './integration-catalog.service.js';
import { IntegrationKeyGuard } from './integration-key.guard.js';
import { IntegrationKeyService } from './integration-key.service.js';
import { IntegrationKeysController } from './integration-keys.controller.js';

@Module({
  imports: [AuthModule, InventoryModule],
  controllers: [IntegrationCatalogController, IntegrationKeysController],
  providers: [
    {
      provide: IntegrationKeyService,
      inject: [DatabaseService, appConfig.KEY, EffectivePermissionsService],
      useFactory: (
        database: DatabaseService,
        configuration: ConfigType<typeof appConfig>,
        permissions: EffectivePermissionsService,
      ) =>
        database.instantiateProvider(
          (client) =>
            new IntegrationKeyService(client, configuration, permissions),
        ),
    },
    {
      provide: IntegrationCatalogService,
      inject: [InventoryReadService],
      useFactory: (inventory: InventoryReadService) =>
        new IntegrationCatalogService(inventory),
    },
    IntegrationKeyGuard,
  ],
})
export class IntegrationsModule {}
