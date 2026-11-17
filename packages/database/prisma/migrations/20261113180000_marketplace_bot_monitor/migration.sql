BEGIN;

-- ADR-024. Existing catalog credentials retain their read-only scope.
ALTER TABLE integration_keys
  ADD COLUMN marketplace_bot_instance_key VARCHAR(64),
  DROP CONSTRAINT integration_keys_read_only_scopes,
  ADD CONSTRAINT integration_keys_purpose_check CHECK (
    (marketplace_bot_instance_key IS NULL
      AND cardinality(scopes) > 0 AND scopes <@ ARRAY['inventory.read']::TEXT[])
    OR
    (marketplace_bot_instance_key IS NOT NULL
      AND marketplace_bot_instance_key ~ '^[A-Za-z0-9_-]{8,64}$'
      AND scopes = ARRAY['marketplace-bot.sync']::TEXT[])
  );
CREATE TABLE marketplace_bot_instances (
  id UUID PRIMARY KEY,
  instance_key VARCHAR(64) NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  integration_key_id UUID NOT NULL REFERENCES integration_keys(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  instance_name VARCHAR(80) NOT NULL,
  bot_version VARCHAR(40) NOT NULL,
  snapshot JSONB NOT NULL,
  last_heartbeat_at TIMESTAMPTZ(6) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT marketplace_bot_instances_owner_instance_key UNIQUE (owner_user_id, instance_key),
  CONSTRAINT marketplace_bot_instances_instance_key_format CHECK (instance_key ~ '^[A-Za-z0-9_-]{8,64}$'),
  CONSTRAINT marketplace_bot_instances_name_not_blank CHECK (length(btrim(instance_name)) > 0),
  CONSTRAINT marketplace_bot_instances_snapshot_object CHECK (jsonb_typeof(snapshot) = 'object')
);
CREATE INDEX marketplace_bot_instances_key_idx ON marketplace_bot_instances(integration_key_id);

CREATE TABLE marketplace_bot_commands (
  id UUID PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES marketplace_bot_instances(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  command_type VARCHAR(40) NOT NULL,
  request_key_hash CHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  result_detail VARCHAR(500),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dispatched_at TIMESTAMPTZ(6),
  completed_at TIMESTAMPTZ(6),
  CONSTRAINT marketplace_bot_commands_actor_request_key UNIQUE (created_by_user_id, request_key_hash),
  CONSTRAINT marketplace_bot_commands_status_check CHECK (
    status IN ('PENDING', 'DISPATCHED', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED')
  ),
  CONSTRAINT marketplace_bot_commands_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT marketplace_bot_commands_completion CHECK (
    (status IN ('PENDING', 'DISPATCHED')) = (completed_at IS NULL)
  ),
  CONSTRAINT marketplace_bot_commands_dispatch CHECK (
    (status IN ('DISPATCHED', 'COMPLETED', 'FAILED')) = (dispatched_at IS NOT NULL)
  )
);
CREATE INDEX marketplace_bot_commands_instance_status_idx
  ON marketplace_bot_commands(instance_id, status, created_at);

COMMIT;
