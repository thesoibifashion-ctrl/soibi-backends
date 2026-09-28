CREATE TABLE mobile_upload_sessions (
  session_id TEXT PRIMARY KEY,
  receipt_url TEXT NULL,
  receipt_public_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes')
);
