import 'reflect-metadata';

import type { ConfigType } from '@nestjs/config';

import { createApplication } from './bootstrap.js';
import { appConfig } from './config/app.config.js';

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const configuration = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);
  await app.listen(configuration.apiPort, '0.0.0.0');
}

void bootstrap();
