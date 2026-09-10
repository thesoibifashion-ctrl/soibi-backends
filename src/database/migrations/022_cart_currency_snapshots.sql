-- Preserve every active product price at add-to-cart time and the customer's
-- cart-level display currency. Submitted history needs the same selection for
-- guest and authenticated orders.
ALTER TABLE carts
  ADD COLUMN IF NOT EXISTS selected_currency VARCHAR(3) NULL;

ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS prices_snapshot JSONB NULL;

ALTER TABLE cart_history
  ADD COLUMN IF NOT EXISTS selected_currency VARCHAR(3) NULL;

ALTER TABLE carts
  ADD CONSTRAINT carts_selected_currency_uppercase_check
  CHECK (selected_currency IS NULL OR selected_currency = upper(selected_currency));

ALTER TABLE cart_history
  ADD CONSTRAINT cart_history_selected_currency_uppercase_check
  CHECK (selected_currency IS NULL OR selected_currency = upper(selected_currency));
