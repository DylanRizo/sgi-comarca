import { marketplaceBotInstanceKeyPattern } from '@sgi/contracts';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class MarketplaceBotCommandResultDto {
  @IsUUID()
  id!: string;

  @IsString()
  @IsIn(['COMPLETED', 'FAILED'])
  status!: 'COMPLETED' | 'FAILED';

  @IsOptional()
  @IsString()
  detail?: string;
}

export class MarketplaceBotSyncDto {
  @IsString()
  @Matches(marketplaceBotInstanceKeyPattern)
  instanceKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/\S/u)
  instanceName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  botVersion!: string;

  @IsObject()
  snapshot!: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => MarketplaceBotCommandResultDto)
  commandResults?: MarketplaceBotCommandResultDto[];

  @IsOptional()
  @IsIn([1])
  commandProtocolVersion?: 1;
}

export class MarketplaceBotInstanceIdParamDto {
  @IsUUID()
  instanceId!: string;
}

export class MarketplaceBotCommandIdParamDto {
  @IsUUID()
  commandId!: string;
}

export class EnqueueMarketplaceBotCommandDto {
  @IsObject()
  command!: Record<string, unknown>;

  @IsUUID('4')
  requestId!: string;
}
