-- Direct user-level authorization decisions can explicitly grant or deny a
-- permission. RolePermission remains grant-only.
CREATE TYPE "permission_effect" AS ENUM ('GRANT', 'DENY');

-- The default performs a safe backfill for every existing direct grant and
-- preserves insertion semantics for callers that predate this migration.
ALTER TABLE "user_permissions"
  ADD COLUMN "effect" "permission_effect" NOT NULL DEFAULT 'GRANT';

-- Fail the migration if the approved backfill or the existing partial unique
-- index that prevents duplicate active decisions is not present.
DO $permission_effect_guard$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "user_permissions"
     WHERE "effect" IS DISTINCT FROM 'GRANT'::"permission_effect"
  ) THEN
    RAISE EXCEPTION 'Existing UserPermission rows were not preserved as GRANT';
  END IF;

  IF to_regclass('public.user_permissions_active_key') IS NULL THEN
    RAISE EXCEPTION 'The active UserPermission uniqueness index is missing';
  END IF;
END
$permission_effect_guard$;
