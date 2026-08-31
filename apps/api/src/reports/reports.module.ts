import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseService } from '../database/database.service.js';
import { ReportReadService } from './report-read.service.js';
import { ReportsController } from './reports.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [ReportsController],
  providers: [
    {
      provide: ReportReadService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider((client) => new ReportReadService(client)),
    },
  ],
  exports: [ReportReadService],
})
export class ReportsModule {}
