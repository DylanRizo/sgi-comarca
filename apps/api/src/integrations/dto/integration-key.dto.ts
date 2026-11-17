import { ValidationPipe } from '@nestjs/common';
import { marketplaceBotInstanceKeyPattern } from '@sgi/contracts';
import {
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/read-query.dto.js';

export class CreateIntegrationKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/\S/u)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays!: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(marketplaceBotInstanceKeyPattern)
  marketplaceBotInstanceKey?: string;
}

export class IntegrationKeyIdParamDto {
  @IsUUID()
  id!: string;
}

export class IntegrationCatalogQueryDto extends PaginationQueryDto {}

export const integrationCatalogQueryPipe = new ValidationPipe({
  expectedType: IntegrationCatalogQueryDto,
  forbidNonWhitelisted: true,
  transform: true,
  whitelist: true,
});
