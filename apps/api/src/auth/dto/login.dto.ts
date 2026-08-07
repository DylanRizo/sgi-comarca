import { IsString } from 'class-validator';

import { CodePointLength } from './code-point-length.validator.js';

export class LoginDto {
  @IsString()
  @CodePointLength(1, 64)
  identifier!: string;

  @IsString()
  @CodePointLength(1, 128)
  password!: string;
}
