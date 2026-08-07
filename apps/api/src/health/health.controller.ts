import { Controller, Get, Header, Headers, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ApiSuccess, HealthData, ReadinessData } from '@sgi/contracts';
import { randomUUID } from 'node:crypto';

import { PublicRoute } from '../auth/decorators/public-route.decorator.js';
import { HealthService } from './health.service.js';

function requestId(incomingRequestId: string | undefined): string {
  const candidate = incomingRequestId?.trim();
  return candidate && candidate.length <= 128 ? candidate : randomUUID();
}

@ApiTags('technical')
@Controller({ version: '1' })
export class HealthController {
  constructor(
    @Inject(HealthService) private readonly healthService: HealthService,
  ) {}

  @Get('health')
  @PublicRoute()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Confirma que el proceso de la API responde.' })
  @ApiOkResponse({ description: 'Proceso activo.' })
  health(
    @Headers('x-request-id') incomingRequestId?: string,
  ): ApiSuccess<HealthData> {
    return {
      data: this.healthService.health(),
      meta: { requestId: requestId(incomingRequestId) },
    };
  }

  @Get('ready')
  @PublicRoute()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Comprueba disponibilidad de PostgreSQL.' })
  @ApiOkResponse({ description: 'API y PostgreSQL disponibles.' })
  async readiness(
    @Headers('x-request-id') incomingRequestId?: string,
  ): Promise<ApiSuccess<ReadinessData>> {
    return {
      data: await this.healthService.readiness(),
      meta: { requestId: requestId(incomingRequestId) },
    };
  }
}
