import { IsString } from 'class-validator';

import {
  CodePointLength,
  IsCanonicalAuthToken,
} from './code-point-length.validator.js';

export class ActivateAccountDto {
  @IsString()
  @CodePointLength(12, 128)
  password!: string;

  @IsString()
  @IsCanonicalAuthToken()
  token!: string;
}
