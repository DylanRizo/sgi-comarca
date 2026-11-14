BEGIN;

-- ADR-024. A queued command is handed to the bot exactly once, so the SGI must
-- remember when that happened: a delivered command can no longer be cancelled
-- and it only expires as "never received" while it was never handed over.
-- Additive: three nullable columns, two checks and one unique index. No
-- existing row is rewritten.
ALTER TABLE marketplace_bot_commands
  ADD COLUMN delivered_at TIMESTAMPTZ(6),
  ADD COLUMN idempotency_key_hash CHAR(64),
  ADD COLUMN request_hash CHAR(64),
  -- Cancelling only makes sense before the bot has the command.
  ADD CONSTRAINT marketplace_bot_commands_cancelled_undelivered CHECK (
    status <> 'CANCELLED' OR delivered_at IS NULL
  ),
  ADD CONSTRAINT marketplace_bot_commands_idempotency_pair CHECK (
    (idempotency_key_hash IS NULL) = (request_hash IS NULL)
  );

-- Same convention as the other idempotent mutations: the key is stored hashed
-- and scoped to the person who queued the command.
CREATE UNIQUE INDEX marketplace_bot_commands_creator_idempotency_key
  ON marketplace_bot_commands(created_by_user_id, idempotency_key_hash);

COMMIT;
