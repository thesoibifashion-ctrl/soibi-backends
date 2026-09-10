-- Passwordless email sign-in codes. Hashes are stored so a database disclosure
-- cannot be used to authenticate a customer.
CREATE TABLE email_login_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_login_codes_email_created_at
  ON email_login_codes (email, created_at DESC);
