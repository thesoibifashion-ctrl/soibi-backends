ALTER TABLE cart_history
  ADD COLUMN IF NOT EXISTS guest_payment_token_hash CHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS source_cart_item_ids UUID[] NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_history_one_pending_payment_per_cart
  ON cart_history(original_cart_id)
  WHERE original_cart_id IS NOT NULL AND status = 'pending_payment';
