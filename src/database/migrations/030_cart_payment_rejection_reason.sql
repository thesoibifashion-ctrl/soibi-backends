ALTER TABLE cart_history
  ADD COLUMN IF NOT EXISTS payment_rejection_reason TEXT NULL;
