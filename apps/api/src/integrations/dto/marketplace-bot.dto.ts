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

  // Deliberately unbounded here: the service keeps the first 500 characters.
  // Rejecting a long failure message would reject the whole heartbeat, and the
  // bot would repeat it forever.
  @IsOptional()
  @IsString()
  detail?: string;
}

export class MarketplaceBotSyncDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/u)
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
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => MarketplaceBotCommandResultDto)
  commandResults?: MarketplaceBotCommandResultDto[];
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
}
