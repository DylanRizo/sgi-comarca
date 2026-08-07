import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSION_METADATA = 'auth:required-permission';

export const RequirePermission = (
  permission: string,
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSION_METADATA, permission);
