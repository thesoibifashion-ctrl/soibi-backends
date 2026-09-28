-- Migration 025: Paystack payment tracking on cart_history
-- Adds paystack_reference (unique Paystack transaction reference) and
-- payment_status to cart_history so the backend can safely associate a
-- verified Paystack transaction with the correct order and prevent
-- duplicate payment processing.

ALTER TABLE cart_history
  ADD COLUMN IF NOT EXISTS paystack_reference VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS payment_status     VARCHAR(20)  NOT NULL DEFAULT 'unpaid';

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_history_paystack_reference
  ON cart_history(paystack_reference)
  WHERE paystack_reference IS NOT NULL;
