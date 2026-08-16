import { Module } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import { UnitReadService } from './unit-read.service.js';
import { UnitsController } from './units.controller.js';

@Module({
  controllers: [UnitsController],
  providers: [
    {
      provide: UnitReadService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider((client) => new UnitReadService(client)),
    },
  ],
  exports: [UnitReadService],
})
export class UnitsModule {}
