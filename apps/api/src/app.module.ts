import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { AnalyticsModule } from './analytics/analytics.module.js';
import { AuthModule } from './auth/auth.module.js';
import { appConfig } from './config/app.config.js';
import { DatabaseModule } from './database/database.module.js';
import { FinancesModule } from './finances/finances.module.js';
import { HealthModule } from './health/health.module.js';
import { InventoryCountsModule } from './inventory-counts/inventory-counts.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { ProductsModule } from './products/products.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { SalesModule } from './sales/sales.module.js';
import { UnitsModule } from './units/units.module.js';
import { WarehousesModule } from './warehouses/warehouses.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      load: [appConfig],
    }),
    LoggerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (configuration: ConfigType<typeof appConfig>) => ({
        pinoHttp: {
          level: configuration.logLevel,
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers.idempotency-key',
            'req.headers.origin',
            'req.headers.x-csrf-token',
            'res.headers.set-cookie',
          ],
          serializers: {
            req: (request) => ({
              id: request.id,
              method: request.method,
              path:
                typeof request.url === 'string'
                  ? request.url.split('?')[0]
                  : undefined,
            }),
            res: (response) => ({ statusCode: response.statusCode }),
          },
        },
      }),
    }),
    DatabaseModule,
    AuthModule,
    HealthModule,
    ProductsModule,
    UnitsModule,
    WarehousesModule,
    InventoryModule,
    InventoryCountsModule,
    SalesModule,
    FinancesModule,
    ReportsModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
