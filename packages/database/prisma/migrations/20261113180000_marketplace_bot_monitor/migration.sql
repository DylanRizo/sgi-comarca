BEGIN;

-- ADR-024. Telemetry and remote commands for the Marketplace bot. Additive:
-- no existing table, permission, role or business row is touched.
CREATE TABLE marketplace_bot_instances (
  id UUID PRIMARY KEY,
  instance_key VARCHAR(64) NOT NULL,
  integration_key_id UUID NOT NULL REFERENCES integration_keys(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  instance_name VARCHAR(80) NOT NULL,
  bot_version VARCHAR(40) NOT NULL,
  snapshot JSONB NOT NULL,
  last_heartbeat_at TIMESTAMPTZ(6) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT marketplace_bot_instances_instance_key_key UNIQUE (instance_key),
  CONSTRAINT marketplace_bot_instances_instance_key_format CHECK (instance_key ~ '^[A-Za-z0-9_-]{8,64}$'),
  CONSTRAINT marketplace_bot_instances_name_not_blank CHECK (length(btrim(instance_name)) > 0),
  CONSTRAINT marketplace_bot_instances_snapshot_object CHECK (jsonb_typeof(snapshot) = 'object')
);
CREATE INDEX marketplace_bot_instances_key_idx ON marketplace_bot_instances(integration_key_id);

CREATE TABLE marketplace_bot_commands (
  id UUID PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES marketplace_bot_instances(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  command_type VARCHAR(40) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  result_detail VARCHAR(500),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ(6),
  CONSTRAINT marketplace_bot_commands_status_check CHECK (
    status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED')
  ),
  CONSTRAINT marketplace_bot_commands_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  -- A finished command records when it finished; a pending one has not.
  CONSTRAINT marketplace_bot_commands_completion CHECK (
    (status = 'PENDING') = (completed_at IS NULL)
  )
);
CREATE INDEX marketplace_bot_commands_instance_status_idx
  ON marketplace_bot_commands(instance_id, status, created_at);

COMMIT;
