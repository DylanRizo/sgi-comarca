import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { ApiSuccess, PaginatedData, UnitSummary } from '@sgi/contracts';
import type { Request, Response } from 'express';

import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CatalogListQueryDto } from '../common/dto/read-query.dto.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ResourceIdParamDto } from '../common/dto/resource-id-param.dto.js';
import { mapReadModelError, readSuccess } from '../common/read-http.js';
import { catalogListQueryPipe } from '../common/read-query.pipe.js';
import { UnitReadService } from './unit-read.service.js';

@Controller({ path: 'units', version: '1' })
@RequirePermission('inventory.read')
export class UnitsController {
  constructor(
    @Inject(UnitReadService)
    private readonly units: UnitReadService,
  ) {}

  @Get()
  async list(
    @Query(catalogListQueryPipe) query: CatalogListQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<PaginatedData<UnitSummary>>> {
    return readSuccess(await this.units.list(query), request, response);
  }

  @Get(':id')
  async detail(
    @Param() params: ResourceIdParamDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<UnitSummary>> {
    try {
      return readSuccess(await this.units.get(params.id), request, response);
    } catch (error) {
      mapReadModelError(error);
    }
  }
}
