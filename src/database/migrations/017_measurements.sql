-- Reusable measurement definitions and their product-specific values.

CREATE TABLE measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  measurement_id UUID NOT NULL REFERENCES measurements(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_measurements_product_measurement_unique UNIQUE (product_id, measurement_id),
  CONSTRAINT product_measurements_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX idx_product_measurements_product_id ON product_measurements(product_id);
CREATE INDEX idx_product_measurements_measurement_id ON product_measurements(measurement_id);
CREATE INDEX idx_product_measurements_product_sort_order ON product_measurements(product_id, sort_order);

CREATE TRIGGER trg_measurements_updated_at BEFORE UPDATE ON measurements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_product_measurements_updated_at BEFORE UPDATE ON product_measurements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
