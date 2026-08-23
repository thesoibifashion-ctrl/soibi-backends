-- Adds the identity data needed for backend-owned Google OAuth accounts.
-- Google-only accounts have no local password, while existing email/password
-- accounts continue to retain their password hash.

ALTER TABLE profiles
  ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS google_subject VARCHAR(255) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_google_subject
  ON profiles(google_subject)
  WHERE google_subject IS NOT NULL;
