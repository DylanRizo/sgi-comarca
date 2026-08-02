import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  checkDatabaseConnection,
  createDatabaseClient,
  type DatabaseClient,
} from '@sgi/database';

import { appConfig } from '../config/app.config.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly client: DatabaseClient;

  constructor(
    @Inject(appConfig.KEY)
    configuration: ConfigType<typeof appConfig>,
  ) {
    this.client = createDatabaseClient(configuration.databaseUrl);
  }

  async ping(): Promise<void> {
    await checkDatabaseConnection(this.client);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
