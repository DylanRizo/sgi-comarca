CREATE TYPE alexa_oauth_token_kind AS ENUM ('ACCESS', 'REFRESH');

CREATE TABLE alexa_account_links (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  client_id VARCHAR(160) NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  authorized_at TIMESTAMPTZ(6) NOT NULL,
  revoked_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT alexa_account_links_user_client_key UNIQUE (user_id, client_id)
);
CREATE INDEX alexa_account_links_client_revoked_idx ON alexa_account_links(client_id, revoked_at);

CREATE TABLE alexa_authorization_codes (
  id UUID PRIMARY KEY,
  link_id UUID NOT NULL REFERENCES alexa_account_links(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  token_hash CHAR(64) NOT NULL,
  redirect_uri VARCHAR(500) NOT NULL,
  code_challenge VARCHAR(128) NOT NULL,
  code_challenge_method VARCHAR(16) NOT NULL DEFAULT 'S256' CHECK (code_challenge_method = 'S256'),
  expires_at TIMESTAMPTZ(6) NOT NULL,
  consumed_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT alexa_authorization_codes_token_hash_key UNIQUE (token_hash)
);
CREATE INDEX alexa_authorization_codes_link_expires_idx ON alexa_authorization_codes(link_id, expires_at);

CREATE TABLE alexa_oauth_tokens (
  id UUID PRIMARY KEY,
  link_id UUID NOT NULL REFERENCES alexa_account_links(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  kind alexa_oauth_token_kind NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  revoked_at TIMESTAMPTZ(6),
  revocation_reason VARCHAR(120),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT alexa_oauth_tokens_token_hash_key UNIQUE (token_hash)
);
CREATE INDEX alexa_oauth_tokens_link_kind_status_idx ON alexa_oauth_tokens(link_id, kind, revoked_at, expires_at);

CREATE TABLE alexa_rate_limit_windows (
  link_id UUID PRIMARY KEY REFERENCES alexa_account_links(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  window_started_at TIMESTAMPTZ(6) NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TIMESTAMPTZ(6) NOT NULL
);
