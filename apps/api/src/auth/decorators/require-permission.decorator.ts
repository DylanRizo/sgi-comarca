import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSION_METADATA = 'auth:required-permission';

/**
 * Guard a route with a permission. Several codes mean "any of them": FASE 9A
 * defined no read permission for physical counts, so those routes accept either
 * the capture or the approval capability. Deny-by-default is unchanged — an
 * actor still needs at least one listed permission.
 */
export const RequirePermission = (
  ...permissions: [string, ...string[]]
): MethodDecorator & ClassDecorator =>
  SetMetadata(
    REQUIRED_PERMISSION_METADATA,
    // A single permission keeps its plain string metadata, so every existing
    // route and the boundary specs that assert on it are untouched.
    permissions.length === 1 ? permissions[0] : permissions,
  );
