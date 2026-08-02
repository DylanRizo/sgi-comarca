import { Inject, Injectable } from '@nestjs/common';
import type { HealthData, ReadinessData } from '@sgi/contracts';

import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class HealthService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  health(): HealthData {
    return {
      service: 'api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<ReadinessData> {
    await this.database.ping();

    return {
      checks: { database: 'up' },
      service: 'api',
      status: 'ready',
      timestamp: new Date().toISOString(),
    };
  }
}
