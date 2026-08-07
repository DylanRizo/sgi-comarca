import type { DatabaseClient } from '@sgi/database';

type AuthorizationResult = { allowed: boolean };
type PermissionCodeResult = { code: string };

export class EffectivePermissionsService {
  constructor(private readonly client: DatabaseClient) {}

  async hasPermission(
    userId: string,
    permissionCode: string,
  ): Promise<boolean> {
    const rows = await this.client.$queryRaw<AuthorizationResult[]>`
      SELECT
        EXISTS (
          SELECT 1
          FROM permissions AS permission
          WHERE
            permission.code = ${permissionCode}
            AND NOT EXISTS (
              SELECT 1
              FROM user_permissions AS direct_deny
              WHERE
                direct_deny.user_id = ${userId}::uuid
                AND direct_deny.permission_id = permission.id
                AND direct_deny.effect = 'DENY'::permission_effect
                AND direct_deny.revoked_at IS NULL
            )
            AND (
              EXISTS (
                SELECT 1
                FROM user_permissions AS direct_grant
                WHERE
                  direct_grant.user_id = ${userId}::uuid
                  AND direct_grant.permission_id = permission.id
                  AND direct_grant.effect = 'GRANT'::permission_effect
                  AND direct_grant.revoked_at IS NULL
              )
              OR EXISTS (
                SELECT 1
                FROM user_roles AS user_role
                INNER JOIN role_permissions AS role_permission
                  ON role_permission.role_id = user_role.role_id
                  AND role_permission.revoked_at IS NULL
                WHERE
                  user_role.user_id = ${userId}::uuid
                  AND user_role.revoked_at IS NULL
                  AND role_permission.permission_id = permission.id
              )
            )
        ) AS allowed
    `;
    return rows[0]?.allowed ?? false;
  }

  async listPermissions(userId: string): Promise<readonly string[]> {
    const rows = await this.client.$queryRaw<PermissionCodeResult[]>`
      SELECT permission.code
      FROM permissions AS permission
      WHERE
        NOT EXISTS (
          SELECT 1
          FROM user_permissions AS direct_deny
          WHERE
            direct_deny.user_id = ${userId}::uuid
            AND direct_deny.permission_id = permission.id
            AND direct_deny.effect = 'DENY'::permission_effect
            AND direct_deny.revoked_at IS NULL
        )
        AND (
          EXISTS (
            SELECT 1
            FROM user_permissions AS direct_grant
            WHERE
              direct_grant.user_id = ${userId}::uuid
              AND direct_grant.permission_id = permission.id
              AND direct_grant.effect = 'GRANT'::permission_effect
              AND direct_grant.revoked_at IS NULL
          )
          OR EXISTS (
            SELECT 1
            FROM user_roles AS user_role
            INNER JOIN role_permissions AS role_permission
              ON role_permission.role_id = user_role.role_id
              AND role_permission.revoked_at IS NULL
            WHERE
              user_role.user_id = ${userId}::uuid
              AND user_role.revoked_at IS NULL
              AND role_permission.permission_id = permission.id
          )
        )
      ORDER BY permission.code ASC
    `;
    return rows.map(({ code }) => code);
  }
}
