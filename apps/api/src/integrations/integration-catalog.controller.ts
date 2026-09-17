import {
  Controller,
  Get,
  Inject,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type {
  ApiSuccess,
  IntegrationCatalogItem,
  PaginatedData,
} from '@sgi/contracts';
import type { Request, Response } from 'express';

import { ExternalBearerRoute } from '../auth/decorators/external-bearer-route.decorator.js';
import { ServerToServerRoute } from '../auth/decorators/server-to-server-route.decorator.js';
import { readSuccess } from '../common/read-http.js';
import { CurrentIntegrationKey } from './current-integration-key.decorator.js';
// DTO values must remain runtime imports so Nest emits validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  IntegrationCatalogQueryDto,
  integrationCatalogQueryPipe,
} from './dto/integration-key.dto.js';
import { IntegrationCatalogService } from './integration-catalog.service.js';
import { IntegrationKeyGuard } from './integration-key.guard.js';
import {
  IntegrationKeyService,
  type ValidIntegrationKey,
} from './integration-key.service.js';

/**
 * Authenticated by an integration key, not a web session. Not a public route:
 * without a valid Bearer key every request is rejected by the guard.
 */
@Controller({ path: 'integrations', version: '1' })
@ExternalBearerRoute()
@ServerToServerRoute()
@UseGuards(IntegrationKeyGuard)
export class IntegrationCatalogController {
  constructor(
    @Inject(IntegrationCatalogService)
    private readonly catalog: IntegrationCatalogService,
    @Inject(IntegrationKeyService)
    private readonly keys: IntegrationKeyService,
  ) {}

  @Get('catalog')
  async list(
    @Query(integrationCatalogQueryPipe) query: IntegrationCatalogQueryDto,
    @CurrentIntegrationKey() current: ValidIntegrationKey,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<PaginatedData<IntegrationCatalogItem>>> {
    const data = await this.catalog.list(query);
    await this.keys.recordCatalogRead(current, query.page, data.items.length);
    return readSuccess(data, request, response);
  }
}
