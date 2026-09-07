-- Allow the existing cart-history order records to represent one-time guest submissions.
ALTER TABLE cart_history
  ALTER COLUMN profile_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guest_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS guest_email VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS guest_phone VARCHAR(20) NULL;

CREATE INDEX IF NOT EXISTS idx_cart_history_guest_email
  ON cart_history(guest_email)
  WHERE guest_email IS NOT NULL;
