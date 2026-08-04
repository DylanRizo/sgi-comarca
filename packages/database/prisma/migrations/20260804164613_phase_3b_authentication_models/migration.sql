-- Phase 3B authentication storage.
-- Session and invitation hashes are SHA-256 digests encoded as 64 hexadecimal
-- characters. Original tokens must never be persisted.

-- Expand PasswordCredential with nullable revocation metadata so existing rows
-- remain valid and no credential is deleted or recreated.
ALTER TABLE "password_credentials"
  ADD COLUMN "revoke_reason" VARCHAR(300),
  ADD COLUMN "revoked_at" TIMESTAMPTZ(6),
  ADD COLUMN "revoked_by_user_id" UUID;

-- Expand Session first. Phase 3A already has nullable last_seen_at plus nullable
-- revoked_at/revoke_reason, so only the replacement expiration columns are added.
ALTER TABLE "sessions"
  ADD COLUMN "absolute_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN "idle_expires_at" TIMESTAMPTZ(6);

-- Backfill from Phase 3A without assuming that sessions is empty.
UPDATE "sessions"
   SET "last_seen_at" = COALESCE("last_seen_at", "created_at"),
       "absolute_expires_at" = "expires_at",
       "idle_expires_at" = LEAST(
         COALESCE("last_seen_at", "created_at") + INTERVAL '30 minutes',
         "expires_at"
       );

-- Fail before changing token_hash if any existing value would be truncated or
-- is not a SHA-256 hexadecimal digest. The conversion below is explicit.
DO $session_transition_guard$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "sessions"
     WHERE length("token_hash") <> 64
        OR "token_hash" !~ '^[0-9A-Fa-f]{64}$'
  ) THEN
    RAISE EXCEPTION 'Session token_hash must be a 64-character SHA-256 hexadecimal digest; migration aborted without truncation';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "sessions"
     WHERE "last_seen_at" IS NULL
        OR "idle_expires_at" IS NULL
        OR "absolute_expires_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'Session expiration backfill left NULL values';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "sessions"
     WHERE "absolute_expires_at" <= "created_at"
        OR "absolute_expires_at" > "created_at" + INTERVAL '8 hours'
        OR "last_seen_at" < "created_at"
        OR "last_seen_at" > "absolute_expires_at"
        OR "idle_expires_at" < "last_seen_at"
        OR "idle_expires_at" > "absolute_expires_at"
        OR "revoked_at" < "created_at"
  ) THEN
    RAISE EXCEPTION 'Existing Session timestamps are incompatible with the Phase 3B lifecycle';
  END IF;
END
$session_transition_guard$;

ALTER TABLE "sessions"
  ALTER COLUMN "token_hash" TYPE CHAR(64)
    USING "token_hash"::CHAR(64),
  ALTER COLUMN "last_seen_at" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "last_seen_at" SET NOT NULL,
  ALTER COLUMN "idle_expires_at" SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 minutes'),
  ALTER COLUMN "idle_expires_at" SET NOT NULL,
  ALTER COLUMN "absolute_expires_at" SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '8 hours'),
  ALTER COLUMN "absolute_expires_at" SET NOT NULL;

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_token_hash_sha256_hex"
    CHECK ("token_hash" ~ '^[0-9A-Fa-f]{64}$'),
  ADD CONSTRAINT "sessions_timestamps_coherent"
    CHECK (
      "last_seen_at" >= "created_at"
      AND "absolute_expires_at" > "created_at"
      AND "absolute_expires_at" <= "created_at" + INTERVAL '8 hours'
      AND "last_seen_at" <= "absolute_expires_at"
      AND "idle_expires_at" = LEAST(
        "last_seen_at" + INTERVAL '30 minutes',
        "absolute_expires_at"
      )
      AND ("revoked_at" IS NULL OR "revoked_at" >= "created_at")
    ),
  ADD CONSTRAINT "sessions_revocation_metadata_coherent"
    CHECK (
      ("revoked_at" IS NULL AND "revoke_reason" IS NULL)
      OR (
        "revoked_at" IS NOT NULL
        AND "revoke_reason" IS NOT NULL
        AND btrim("revoke_reason") <> ''
      )
    );

CREATE INDEX "sessions_user_absolute_expires_at_idx"
  ON "sessions"("user_id", "absolute_expires_at");
CREATE INDEX "sessions_idle_expires_revoked_at_idx"
  ON "sessions"("idle_expires_at", "revoked_at");
CREATE INDEX "sessions_absolute_expires_revoked_at_idx"
  ON "sessions"("absolute_expires_at", "revoked_at");

DROP INDEX "sessions_expires_revoked_at_idx";
DROP INDEX "sessions_user_expires_at_idx";

-- Contract only after the replacement columns are populated and constrained.
ALTER TABLE "sessions" DROP COLUMN "expires_at";

-- Absolute expiration is immutable. A revoked or expired session cannot be
-- reactivated or renewed by moving last_seen_at/idle_expires_at forward.
CREATE FUNCTION "enforce_session_lifecycle"()
RETURNS trigger
LANGUAGE plpgsql
AS $session_lifecycle$
BEGIN
  IF NEW."absolute_expires_at" IS DISTINCT FROM OLD."absolute_expires_at" THEN
    RAISE EXCEPTION 'session absolute expiration is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."last_seen_at" < OLD."last_seen_at" THEN
    RAISE EXCEPTION 'session last_seen_at cannot move backwards'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."revoked_at" IS NOT NULL AND NEW."revoked_at" IS NULL THEN
    RAISE EXCEPTION 'revoked session cannot be reactivated'
      USING ERRCODE = '23514';
  END IF;

  IF (
    OLD."revoked_at" IS NOT NULL
    OR OLD."idle_expires_at" <= CURRENT_TIMESTAMP
    OR OLD."absolute_expires_at" <= CURRENT_TIMESTAMP
  ) AND (
    NEW."last_seen_at" IS DISTINCT FROM OLD."last_seen_at"
    OR NEW."idle_expires_at" IS DISTINCT FROM OLD."idle_expires_at"
  ) THEN
    RAISE EXCEPTION 'revoked or expired session cannot be renewed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$session_lifecycle$;

CREATE TRIGGER "sessions_lifecycle_guard"
BEFORE UPDATE ON "sessions"
FOR EACH ROW
EXECUTE FUNCTION "enforce_session_lifecycle"();

-- PasswordCredential revocation constraints and relation are additive.
ALTER TABLE "password_credentials"
  ADD CONSTRAINT "password_credentials_timestamps_coherent"
    CHECK (
      "password_changed_at" >= "created_at"
      AND ("revoked_at" IS NULL OR "revoked_at" >= "created_at")
    ),
  ADD CONSTRAINT "password_credentials_revocation_metadata_coherent"
    CHECK (
      (
        "revoked_at" IS NULL
        AND "revoked_by_user_id" IS NULL
        AND "revoke_reason" IS NULL
      )
      OR (
        "revoked_at" IS NOT NULL
        AND "revoke_reason" IS NOT NULL
        AND btrim("revoke_reason") <> ''
      )
    );

CREATE INDEX "password_credentials_revoked_at_idx"
  ON "password_credentials"("revoked_at");
CREATE INDEX "password_credentials_revoker_time_idx"
  ON "password_credentials"("revoked_by_user_id", "revoked_at");

ALTER TABLE "password_credentials"
  ADD CONSTRAINT "password_credentials_revoked_by_user_id_fkey"
  FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- One-use, hash-only invitations. The exact 24-hour lifetime is enforced for
-- both defaulted and explicitly supplied timestamps.
CREATE TABLE "user_invitations" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
  "consumed_at" TIMESTAMPTZ(6),
  "invalidated_at" TIMESTAMPTZ(6),
  "created_by_user_id" UUID,
  "invalidated_by_user_id" UUID,
  "invalidation_reason" VARCHAR(300),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_invitations_token_hash_sha256_hex"
    CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "user_invitations_exact_lifetime"
    CHECK ("expires_at" = "created_at" + INTERVAL '24 hours'),
  CONSTRAINT "user_invitations_terminal_state_exclusive"
    CHECK ("consumed_at" IS NULL OR "invalidated_at" IS NULL),
  CONSTRAINT "user_invitations_timestamps_coherent"
    CHECK (
      ("consumed_at" IS NULL OR (
        "consumed_at" >= "created_at"
        AND "consumed_at" <= "expires_at"
      ))
      AND ("invalidated_at" IS NULL OR "invalidated_at" >= "created_at")
    ),
  CONSTRAINT "user_invitations_invalidation_metadata_coherent"
    CHECK (
      (
        "invalidated_at" IS NULL
        AND "invalidated_by_user_id" IS NULL
        AND "invalidation_reason" IS NULL
      )
      OR (
        "invalidated_at" IS NOT NULL
        AND "invalidation_reason" IS NOT NULL
        AND btrim("invalidation_reason") <> ''
      )
    )
);

CREATE UNIQUE INDEX "user_invitations_token_hash_key"
  ON "user_invitations"("token_hash");
CREATE UNIQUE INDEX "user_invitations_one_pending_per_user"
  ON "user_invitations"("user_id")
  WHERE "consumed_at" IS NULL AND "invalidated_at" IS NULL;
CREATE INDEX "user_invitations_expires_at_idx"
  ON "user_invitations"("expires_at");
CREATE INDEX "user_invitations_user_status_idx"
  ON "user_invitations"("user_id", "consumed_at", "invalidated_at");

ALTER TABLE "user_invitations"
  ADD CONSTRAINT "user_invitations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "user_invitations_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "user_invitations_invalidated_by_user_id_fkey"
  FOREIGN KEY ("invalidated_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Persistent throttle state stores only the normalized identifier and a
-- SHA-256 hash of the request origin. No source IP column exists.
CREATE TABLE "login_throttles" (
  "id" UUID NOT NULL,
  "normalized_identifier" VARCHAR(64) NOT NULL,
  "origin_hash" CHAR(64) NOT NULL,
  "failed_attempt_count" SMALLINT NOT NULL DEFAULT 0,
  "window_started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_failed_at" TIMESTAMPTZ(6),
  "blocked_until" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "login_throttles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "login_throttles_identifier_normalized"
    CHECK (
      length("normalized_identifier") > 0
      AND "normalized_identifier" = lower(btrim("normalized_identifier"))
    ),
  CONSTRAINT "login_throttles_origin_hash_sha256_hex"
    CHECK ("origin_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "login_throttles_attempt_count_range"
    CHECK ("failed_attempt_count" BETWEEN 0 AND 4),
  CONSTRAINT "login_throttles_window_coherent"
    CHECK (
      (
        "failed_attempt_count" = 0
        AND "last_failed_at" IS NULL
        AND "blocked_until" IS NULL
      )
      OR (
        "failed_attempt_count" BETWEEN 1 AND 3
        AND "last_failed_at" >= "window_started_at"
        AND "last_failed_at" <= "window_started_at" + INTERVAL '15 minutes'
        AND "blocked_until" IS NULL
      )
      OR (
        "failed_attempt_count" = 4
        AND "last_failed_at" >= "window_started_at"
        AND "last_failed_at" <= "window_started_at" + INTERVAL '15 minutes'
        AND "blocked_until" = "last_failed_at" + INTERVAL '15 minutes'
      )
    ),
  CONSTRAINT "login_throttles_timestamps_coherent"
    CHECK (
      "window_started_at" >= "created_at"
      AND "updated_at" >= "created_at"
    )
);

CREATE INDEX "login_throttles_blocked_until_idx"
  ON "login_throttles"("blocked_until");
CREATE INDEX "login_throttles_updated_at_idx"
  ON "login_throttles"("updated_at");
CREATE UNIQUE INDEX "login_throttles_identifier_origin_key"
  ON "login_throttles"("normalized_identifier", "origin_hash");
