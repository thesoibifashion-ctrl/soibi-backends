-- Hashed opaque refresh tokens. Token families allow reuse detection to revoke
-- all descendants if an already rotated token is presented again.
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ NULL,
  replaced_by UUID NULL REFERENCES refresh_tokens(id)
);

CREATE INDEX idx_refresh_tokens_family_id ON refresh_tokens (family_id);
CREATE INDEX idx_refresh_tokens_profile_id ON refresh_tokens (profile_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);
