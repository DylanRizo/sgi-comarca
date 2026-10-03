import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import type {
  UpdateUserPermissionsInput,
  UpdateUserRolesInput,
  UserPermissionOverride,
} from '@sgi/contracts';

/**
 * Shapes only. Whether a role or permission exists is answered by the catalog
 * inside the transaction, so a code the manifest adds later needs no change
 * here. The caps are generous over the six roles and 26 permissions in force.
 */
const roleCode = /^[A-Z][A-Z_]{0,63}$/u;
const permissionCode = /^[a-z][a-z0-9_.-]{0,95}$/u;
const effects = ['GRANT', 'DENY'] as const;

export class UpdateUserRolesDto implements UpdateUserRolesInput {
  @IsArray()
  @ArrayMaxSize(16)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(roleCode, { each: true })
  roleCodes!: string[];
}

export class PermissionOverrideDto implements UserPermissionOverride {
  @IsString()
  @Matches(permissionCode)
  code!: string;

  @IsIn(effects)
  effect!: (typeof effects)[number];
}

export class UpdateUserPermissionsDto implements UpdateUserPermissionsInput {
  @IsArray()
  @ArrayMaxSize(64)
  @ArrayUnique((override: PermissionOverrideDto) => override.code)
  @ValidateNested({ each: true })
  @Type(() => PermissionOverrideDto)
  overrides!: PermissionOverrideDto[];
}
