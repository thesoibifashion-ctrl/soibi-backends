-- Admin-managed currencies and manually maintained product prices.
CREATE TABLE currencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(3) NOT NULL,
  name VARCHAR(255) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT currencies_code_unique UNIQUE (code),
  CONSTRAINT currencies_code_uppercase CHECK (code = upper(code))
);

CREATE UNIQUE INDEX currencies_one_default_idx ON currencies (is_default) WHERE is_default = true;

CREATE TABLE product_prices (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  currency_id UUID NOT NULL REFERENCES currencies(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, currency_id)
);

CREATE INDEX product_prices_currency_id_idx ON product_prices (currency_id);

CREATE TRIGGER currencies_set_updated_at BEFORE UPDATE ON currencies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER product_prices_set_updated_at BEFORE UPDATE ON product_prices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
