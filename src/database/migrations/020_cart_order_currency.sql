-- Preserve the selected admin-managed currency code with cart price snapshots.
-- Existing rows intentionally remain NULL: historical amounts cannot safely be assigned a currency retroactively.
ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NULL;

ALTER TABLE cart_history
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NULL;

ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_currency_uppercase_check
  CHECK (currency IS NULL OR currency = upper(currency));

ALTER TABLE cart_history
  ADD CONSTRAINT cart_history_currency_uppercase_check
  CHECK (currency IS NULL OR currency = upper(currency));
