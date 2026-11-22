CREATE TABLE payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_history_id UUID NOT NULL REFERENCES cart_history(id) ON DELETE CASCADE,
  paystack_reference VARCHAR(100) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('initializing', 'ready', 'paid', 'failed', 'abandoned', 'superseded')),
  access_code TEXT NULL,
  authorization_url TEXT NULL,
  amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  recovery_attempted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX idx_payment_attempts_one_active_per_order
  ON payment_attempts(cart_history_id)
  WHERE status IN ('initializing', 'ready');

CREATE INDEX idx_payment_attempts_order_id ON payment_attempts(cart_history_id);
