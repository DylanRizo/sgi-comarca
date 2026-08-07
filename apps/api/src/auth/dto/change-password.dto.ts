import { IsString } from 'class-validator';

import { CodePointLength } from './code-point-length.validator.js';

export class ChangePasswordDto {
  @IsString()
  @CodePointLength(1, 128)
  currentPassword!: string;

  @IsString()
  @CodePointLength(12, 128)
  newPassword!: string;
}
