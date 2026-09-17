CREATE TABLE integration_keys (
  id UUID PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  key_prefix VARCHAR(8) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  last_used_at TIMESTAMPTZ(6),
  revoked_at TIMESTAMPTZ(6),
  revocation_reason VARCHAR(120),
  CONSTRAINT integration_keys_key_hash_key UNIQUE (key_hash),
  CONSTRAINT integration_keys_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT integration_keys_expires_after_creation CHECK (expires_at > created_at),
  CONSTRAINT integration_keys_read_only_scopes CHECK (
    cardinality(scopes) > 0 AND scopes <@ ARRAY['inventory.read']::TEXT[]
  )
);
CREATE INDEX integration_keys_owner_revoked_idx ON integration_keys(owner_user_id, revoked_at);

CREATE TABLE integration_rate_limit_windows (
  key_id UUID PRIMARY KEY REFERENCES integration_keys(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  window_started_at TIMESTAMPTZ(6) NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TIMESTAMPTZ(6) NOT NULL
);
