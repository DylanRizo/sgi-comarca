import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AlexaAuthorizationDto {
  @IsBoolean()
  approved!: boolean;

  @IsString()
  @MinLength(8)
  @MaxLength(160)
  clientId!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43,128}$/u)
  codeChallenge!: string;

  @IsIn(['S256'])
  codeChallengeMethod!: 'S256';

  @IsString()
  @MaxLength(500)
  redirectUri!: string;

  @IsIn(['code'])
  responseType!: 'code';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  scope?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  state!: string;
}

export class AlexaTokenDto {
  @IsString()
  @MinLength(8)
  @MaxLength(160)
  client_id!: string;

  @IsString()
  @MinLength(32)
  @MaxLength(256)
  client_secret!: string;

  @IsIn(['authorization_code', 'refresh_token'])
  grant_type!: 'authorization_code' | 'refresh_token';

  @IsOptional()
  @IsString()
  @MaxLength(256)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  redirect_uri?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._~-]{43,128}$/u)
  code_verifier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  refresh_token?: string;
}

export class AlexaTokenRequestError extends Error {
  constructor() {
    super('Invalid OAuth token request.');
    this.name = 'AlexaTokenRequestError';
  }
}

function tokenField(
  body: Record<string, unknown>,
  name: string,
  minimum: number,
  maximum: number,
  required: boolean,
): string | undefined {
  const value = body[name];
  if (value === undefined && !required) return undefined;
  if (
    typeof value !== 'string' ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw new AlexaTokenRequestError();
  }
  return value;
}

export function parseAlexaTokenDto(input: unknown): AlexaTokenDto {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AlexaTokenRequestError();
  }
  const body = input as Record<string, unknown>;
  const grantType = tokenField(body, 'grant_type', 1, 40, true);
  if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
    throw new AlexaTokenRequestError();
  }
  const verifier = tokenField(body, 'code_verifier', 43, 128, false);
  if (verifier && !/^[A-Za-z0-9._~-]{43,128}$/u.test(verifier)) {
    throw new AlexaTokenRequestError();
  }
  const code = tokenField(body, 'code', 1, 256, false);
  const redirectUri = tokenField(body, 'redirect_uri', 1, 500, false);
  const refreshToken = tokenField(body, 'refresh_token', 1, 256, false);
  return {
    client_id: tokenField(body, 'client_id', 8, 160, true)!,
    client_secret: tokenField(body, 'client_secret', 32, 256, true)!,
    grant_type: grantType,
    ...(code ? { code } : {}),
    ...(verifier ? { code_verifier: verifier } : {}),
    ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
  };
}
