-- =============================================================================
-- Signature by Sarah (SBS) — Phase 3 Migration
-- Database: standard PostgreSQL
-- =============================================================================


-- =============================================================================
-- EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- provides gen_random_uuid()


-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Automatically sets updated_at to now() on every row update.
-- Attached via triggers to every table that has an updated_at column.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- TABLES
-- =============================================================================


-- -----------------------------------------------------------------------------
-- USERS & AUTH
-- -----------------------------------------------------------------------------

-- profiles
-- Backend-owned account and application profile. All application tables reference
-- profiles.id directly, keeping identity and ecommerce authorization together.
CREATE TABLE profiles (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255)  NOT NULL,
  password_hash   TEXT          NOT NULL,
  full_name       VARCHAR(255)  NOT NULL,
  phone           VARCHAR(50)   NULL,
  avatar_url      TEXT          NULL,
  role            VARCHAR(20)   NOT NULL DEFAULT 'customer',
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT profiles_email_unique
    UNIQUE (email),

  CONSTRAINT profiles_role_check
    CHECK (role IN ('customer', 'admin', 'super_admin'))
);


-- -----------------------------------------------------------------------------
-- COLLECTIONS
-- -----------------------------------------------------------------------------

-- collections
-- Groups of products. e.g. Men's Shoes, Women's Shoes, Bags, New Arrivals.
CREATE TABLE collections (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(255)  NOT NULL,
  slug              VARCHAR(255)  NOT NULL,
  description       TEXT          NULL,
  image_url         TEXT          NULL,
  image_public_id   VARCHAR(255)  NULL,
  status            VARCHAR(20)   NOT NULL DEFAULT 'draft',
  sort_order        INTEGER       NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT collections_slug_unique
    UNIQUE (slug),

  CONSTRAINT collections_status_check
    CHECK (status IN ('draft', 'published', 'archived'))
);


-- -----------------------------------------------------------------------------
-- PRODUCTS
-- -----------------------------------------------------------------------------

-- products
-- Core product table. Supports both standard and customizable products.
-- collection_id is intentionally absent — membership is managed via
-- product_collections junction table to allow many-to-many.
CREATE TABLE products (
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(255)    NOT NULL,
  slug                VARCHAR(255)    NOT NULL,
  description         TEXT            NULL,
  base_price          NUMERIC(10,2)   NOT NULL,
  is_customizable     BOOLEAN         NOT NULL DEFAULT false,
  status              VARCHAR(20)     NOT NULL DEFAULT 'draft',
  is_featured         BOOLEAN         NOT NULL DEFAULT false,
  is_hero             BOOLEAN         NOT NULL DEFAULT false,
  sort_order          INTEGER         NOT NULL DEFAULT 0,
  meta_title          VARCHAR(255)    NULL,
  meta_description    TEXT            NULL,
  deleted_at          TIMESTAMPTZ     NULL,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT products_slug_unique
    UNIQUE (slug),

  CONSTRAINT products_base_price_check
    CHECK (base_price >= 0),

  CONSTRAINT products_status_check
    CHECK (status IN ('draft', 'published', 'archived'))
);


-- product_images
-- Multiple images per product. One image per product may be flagged is_primary.
-- Enforced at DB level via partial unique index (see INDEXES section).
CREATE TABLE product_images (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID          NOT NULL,
  image_url         TEXT          NOT NULL,
  image_public_id   VARCHAR(255)  NOT NULL,
  alt_text          VARCHAR(255)  NULL,
  sort_order        INTEGER       NOT NULL DEFAULT 0,
  is_primary        BOOLEAN       NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT product_images_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);


-- product_collections
-- Junction table. Allows a product to belong to multiple collections.
-- sort_order is per-collection so a product can be ranked differently
-- in each collection it belongs to.
CREATE TABLE product_collections (
  product_id      UUID      NOT NULL,
  collection_id   UUID      NOT NULL,
  sort_order      INTEGER   NOT NULL DEFAULT 0,

  CONSTRAINT product_collections_pkey
    PRIMARY KEY (product_id, collection_id),

  CONSTRAINT product_collections_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,

  CONSTRAINT product_collections_collection_id_fkey
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);


-- -----------------------------------------------------------------------------
-- MATERIALS & COLORS
-- -----------------------------------------------------------------------------

-- materials
-- Managed list of materials the brand works with. e.g. Full Grain Leather, Suede.
CREATE TABLE materials (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(255)  NOT NULL,
  description       TEXT          NULL,
  image_url         TEXT          NULL,
  image_public_id   VARCHAR(255)  NULL,
  is_active         BOOLEAN       NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT materials_name_unique
    UNIQUE (name)
);


-- colors
-- Managed list of available colors. Used across products and variants.
CREATE TABLE colors (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(255)  NOT NULL,
  hex_code          VARCHAR(7)    NULL,
  image_url         TEXT          NULL,
  image_public_id   VARCHAR(255)  NULL,
  is_active         BOOLEAN       NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT colors_name_unique
    UNIQUE (name),

  CONSTRAINT colors_hex_code_check
    CHECK (hex_code IS NULL OR hex_code ~ '^#[0-9A-Fa-f]{6}$')
);


-- product_materials
-- Junction: which materials are available for a given product.
-- price_adjustment is the premium for choosing this material on this product.
CREATE TABLE product_materials (
  product_id        UUID            NOT NULL,
  material_id       UUID            NOT NULL,
  price_adjustment  NUMERIC(10,2)   NOT NULL DEFAULT 0,
  is_default        BOOLEAN         NOT NULL DEFAULT false,

  CONSTRAINT product_materials_pkey
    PRIMARY KEY (product_id, material_id),

  CONSTRAINT product_materials_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,

  CONSTRAINT product_materials_material_id_fkey
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT
);


-- product_colors
-- Junction: which colors are available for a given product (for the color picker UI).
-- Separate from product_variants.color_id which is the variant-level assignment.
CREATE TABLE product_colors (
  product_id        UUID            NOT NULL,
  color_id          UUID            NOT NULL,
  price_adjustment  NUMERIC(10,2)   NOT NULL DEFAULT 0,
  is_default        BOOLEAN         NOT NULL DEFAULT false,

  CONSTRAINT product_colors_pkey
    PRIMARY KEY (product_id, color_id),

  CONSTRAINT product_colors_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,

  CONSTRAINT product_colors_color_id_fkey
    FOREIGN KEY (color_id) REFERENCES colors(id) ON DELETE RESTRICT
);


-- product_variants
-- Each variant is a specific orderable unit: a size, or a size+color combination.
-- Final price = products.base_price + product_variants.price_adjustment.
CREATE TABLE product_variants (
  id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID            NOT NULL,
  color_id          UUID            NULL,
  size_label        VARCHAR(50)     NULL,
  size_value        NUMERIC(5,2)    NULL,
  sku               VARCHAR(100)    NULL,
  price_adjustment  NUMERIC(10,2)   NOT NULL DEFAULT 0,
  is_available      BOOLEAN         NOT NULL DEFAULT true,
  sort_order        INTEGER         NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT product_variants_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,

  CONSTRAINT product_variants_color_id_fkey
    FOREIGN KEY (color_id) REFERENCES colors(id) ON DELETE SET NULL,

  CONSTRAINT product_variants_sku_unique
    UNIQUE (sku),

  CONSTRAINT product_variants_product_color_size_unique
    UNIQUE (product_id, color_id, size_label)
);


-- -----------------------------------------------------------------------------
-- SHOPPING
-- -----------------------------------------------------------------------------

-- carts
-- One cart per logged-in user, one per guest session.
-- Guest carts are identified by session_id (server-generated token in HTTP-only cookie).
-- When a guest logs in, their guest cart is merged into their user cart.
CREATE TABLE carts (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID          NULL,
  session_id    VARCHAR(255)  NULL,
  expires_at    TIMESTAMPTZ   NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT carts_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,

  CONSTRAINT carts_profile_id_unique
    UNIQUE (profile_id),

  CONSTRAINT carts_session_id_unique
    UNIQUE (session_id),

  -- A cart must belong to either a profile or a session, never neither
  CONSTRAINT carts_owner_check
    CHECK (
      (profile_id IS NOT NULL AND session_id IS NULL) OR
      (profile_id IS NULL AND session_id IS NOT NULL)
    )
);


-- cart_items
-- Line items inside a cart. Captures full customization state.
-- unit_price_snapshot locks in the price at time of adding to cart.
-- custom_measurements uses JSONB because measurement fields vary by product type.
CREATE TABLE cart_items (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id               UUID            NOT NULL,
  product_id            UUID            NOT NULL,
  variant_id            UUID            NULL,
  material_id           UUID            NULL,
  color_id              UUID            NULL,
  quantity              INTEGER         NOT NULL DEFAULT 1,
  custom_measurements   JSONB           NULL,
  custom_notes          TEXT            NULL,
  unit_price_snapshot   NUMERIC(10,2)   NOT NULL,
  created_at            TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT cart_items_cart_id_fkey
    FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,

  CONSTRAINT cart_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,

  CONSTRAINT cart_items_variant_id_fkey
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,

  CONSTRAINT cart_items_material_id_fkey
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL,

  CONSTRAINT cart_items_color_id_fkey
    FOREIGN KEY (color_id) REFERENCES colors(id) ON DELETE SET NULL,

  CONSTRAINT cart_items_quantity_check
    CHECK (quantity > 0),

  CONSTRAINT cart_items_unit_price_snapshot_check
    CHECK (unit_price_snapshot >= 0)
);


-- favorites
-- Saved products per logged-in user.
-- Intentionally separate from cart: different purpose, different lifecycle.
CREATE TABLE favorites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID        NOT NULL,
  product_id  UUID        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT favorites_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,

  CONSTRAINT favorites_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,

  CONSTRAINT favorites_profile_product_unique
    UNIQUE (profile_id, product_id)
);


-- -----------------------------------------------------------------------------
-- QUOTES
-- -----------------------------------------------------------------------------

-- quote_requests
-- Primary conversion event. No payment — customers request a quote.
-- Supports both logged-in users and guests.
CREATE TABLE quote_requests (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number    VARCHAR(50)   NOT NULL,
  profile_id          UUID          NULL,
  guest_name          VARCHAR(255)  NULL,
  guest_email         VARCHAR(255)  NULL,
  guest_phone         VARCHAR(50)   NULL,
  status              VARCHAR(30)   NOT NULL DEFAULT 'pending',
  admin_notes         TEXT          NULL,
  customer_notes      TEXT          NULL,
  submitted_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  reviewed_at         TIMESTAMPTZ   NULL,
  completed_at        TIMESTAMPTZ   NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT quote_requests_reference_number_unique
    UNIQUE (reference_number),

  CONSTRAINT quote_requests_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL,

  CONSTRAINT quote_requests_status_check
    CHECK (status IN ('pending', 'reviewing', 'approved', 'completed', 'cancelled')),

  -- A quote must have either a profile or guest contact info
  CONSTRAINT quote_requests_owner_check
    CHECK (
      profile_id IS NOT NULL OR
      (guest_name IS NOT NULL AND guest_email IS NOT NULL)
    )
);


-- quote_items
-- Snapshot of each item in a quote. Deliberately denormalized.
-- _snapshot columns are the source of truth — they preserve what the customer
-- requested even if the product is later renamed, repriced, or deleted.
-- product_id is kept as a soft analytics reference only (SET NULL on delete).
CREATE TABLE quote_items (
  id                        UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id          UUID            NOT NULL,
  product_id                UUID            NULL,
  product_name_snapshot     VARCHAR(255)    NOT NULL,
  variant_label_snapshot    VARCHAR(255)    NULL,
  material_name_snapshot    VARCHAR(255)    NULL,
  color_name_snapshot       VARCHAR(255)    NULL,
  quantity                  INTEGER         NOT NULL DEFAULT 1,
  unit_price_snapshot       NUMERIC(10,2)   NOT NULL,
  custom_measurements       JSONB           NULL,
  custom_notes              TEXT            NULL,
  created_at                TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT quote_items_quote_request_id_fkey
    FOREIGN KEY (quote_request_id) REFERENCES quote_requests(id) ON DELETE CASCADE,

  CONSTRAINT quote_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,

  CONSTRAINT quote_items_quantity_check
    CHECK (quantity > 0),

  CONSTRAINT quote_items_unit_price_snapshot_check
    CHECK (unit_price_snapshot >= 0)
);


-- -----------------------------------------------------------------------------
-- CONTENT
-- -----------------------------------------------------------------------------

-- gallery_images
-- Workshop, craftsmanship, and completed work images.
CREATE TABLE gallery_images (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  title             VARCHAR(255)  NULL,
  image_url         TEXT          NOT NULL,
  image_public_id   VARCHAR(255)  NOT NULL,
  category          VARCHAR(50)   NOT NULL,
  sort_order        INTEGER       NOT NULL DEFAULT 0,
  is_published      BOOLEAN       NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT gallery_images_category_check
    CHECK (category IN ('workshop', 'craftsmanship', 'completed_work'))
);


-- settings
-- Flexible key-value store for all site-wide configuration.
-- `value` holds simple strings. `value_json` holds structured data (e.g. social links).
-- `group` allows fetching all settings for a section in one query.
-- `is_public` controls which settings are safe to return to the frontend unauthenticated.
CREATE TABLE settings (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  key           VARCHAR(100)  NOT NULL,
  value         TEXT          NULL,
  value_json    JSONB         NULL,
  group_name    VARCHAR(50)   NOT NULL,
  label         VARCHAR(255)  NOT NULL,
  description   TEXT          NULL,
  is_public     BOOLEAN       NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT settings_key_unique
    UNIQUE (key),

  CONSTRAINT settings_group_name_check
    CHECK (group_name IN ('general', 'hero', 'footer', 'social', 'contact'))
);


-- -----------------------------------------------------------------------------
-- FORMS
-- -----------------------------------------------------------------------------

-- contact_submissions
-- Contact form submissions. Separate from academy_registrations because
-- the fields, workflow, and business meaning are entirely different.
CREATE TABLE contact_submissions (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255)  NOT NULL,
  email         VARCHAR(255)  NOT NULL,
  phone         VARCHAR(50)   NULL,
  subject       VARCHAR(255)  NULL,
  message       TEXT          NOT NULL,
  is_read       BOOLEAN       NOT NULL DEFAULT false,
  admin_notes   TEXT          NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);


-- academy_registrations
-- Registrations for the SBS Academy program.
-- Has its own status lifecycle and fields not relevant to contact submissions.
CREATE TABLE academy_registrations (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name         VARCHAR(255)  NOT NULL,
  email             VARCHAR(255)  NOT NULL,
  phone             VARCHAR(50)   NOT NULL,
  country           VARCHAR(100)  NULL,
  experience_level  VARCHAR(50)   NULL,
  motivation        TEXT          NULL,
  status            VARCHAR(30)   NOT NULL DEFAULT 'pending',
  admin_notes       TEXT          NULL,
  is_read           BOOLEAN       NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT academy_registrations_status_check
    CHECK (status IN ('pending', 'contacted', 'enrolled', 'rejected')),

  CONSTRAINT academy_registrations_experience_level_check
    CHECK (experience_level IS NULL OR experience_level IN ('beginner', 'intermediate', 'advanced'))
);


-- =============================================================================
-- INDEXES
-- =============================================================================

-- profiles
CREATE INDEX idx_profiles_email           ON profiles(email);
CREATE INDEX idx_profiles_role           ON profiles(role);

-- collections
CREATE INDEX idx_collections_slug        ON collections(slug);
CREATE INDEX idx_collections_status      ON collections(status);

-- products
CREATE INDEX idx_products_slug           ON products(slug);
CREATE INDEX idx_products_status         ON products(status);
CREATE INDEX idx_products_is_featured    ON products(is_featured);
CREATE INDEX idx_products_is_hero        ON products(is_hero);
CREATE INDEX idx_products_deleted_at     ON products(deleted_at);

-- product_images
CREATE INDEX idx_product_images_product_id  ON product_images(product_id);
-- Enforces only one primary image per product at the database level
CREATE UNIQUE INDEX idx_product_images_one_primary
  ON product_images(product_id)
  WHERE is_primary = true;

-- product_collections
CREATE INDEX idx_product_collections_product_id     ON product_collections(product_id);
CREATE INDEX idx_product_collections_collection_id  ON product_collections(collection_id);

-- product_variants
CREATE INDEX idx_product_variants_product_id   ON product_variants(product_id);
CREATE INDEX idx_product_variants_color_id     ON product_variants(color_id);
CREATE INDEX idx_product_variants_is_available ON product_variants(is_available);

-- carts
CREATE INDEX idx_carts_profile_id    ON carts(profile_id);
CREATE INDEX idx_carts_session_id    ON carts(session_id);
CREATE INDEX idx_carts_expires_at    ON carts(expires_at);

-- cart_items
CREATE INDEX idx_cart_items_cart_id      ON cart_items(cart_id);
CREATE INDEX idx_cart_items_product_id   ON cart_items(product_id);

-- favorites
CREATE INDEX idx_favorites_profile_id    ON favorites(profile_id);
CREATE INDEX idx_favorites_product_id    ON favorites(product_id);

-- quote_requests
CREATE INDEX idx_quote_requests_profile_id        ON quote_requests(profile_id);
CREATE INDEX idx_quote_requests_status            ON quote_requests(status);
CREATE INDEX idx_quote_requests_reference_number  ON quote_requests(reference_number);
CREATE INDEX idx_quote_requests_guest_email       ON quote_requests(guest_email);

-- quote_items
CREATE INDEX idx_quote_items_quote_request_id  ON quote_items(quote_request_id);
CREATE INDEX idx_quote_items_product_id        ON quote_items(product_id);

-- gallery_images
CREATE INDEX idx_gallery_images_category      ON gallery_images(category);
CREATE INDEX idx_gallery_images_is_published  ON gallery_images(is_published);

-- settings
CREATE INDEX idx_settings_key         ON settings(key);
CREATE INDEX idx_settings_group_name  ON settings(group_name);
CREATE INDEX idx_settings_is_public   ON settings(is_public);

-- contact_submissions
CREATE INDEX idx_contact_submissions_is_read  ON contact_submissions(is_read);
CREATE INDEX idx_contact_submissions_email    ON contact_submissions(email);

-- academy_registrations
CREATE INDEX idx_academy_registrations_status   ON academy_registrations(status);
CREATE INDEX idx_academy_registrations_email    ON academy_registrations(email);
CREATE INDEX idx_academy_registrations_is_read  ON academy_registrations(is_read);


-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Attach set_updated_at() to every table that has an updated_at column.

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_collections_updated_at
  BEFORE UPDATE ON collections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_product_images_updated_at
  BEFORE UPDATE ON product_images
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_materials_updated_at
  BEFORE UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_colors_updated_at
  BEFORE UPDATE ON colors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_product_variants_updated_at
  BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_carts_updated_at
  BEFORE UPDATE ON carts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cart_items_updated_at
  BEFORE UPDATE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_quote_requests_updated_at
  BEFORE UPDATE ON quote_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_gallery_images_updated_at
  BEFORE UPDATE ON gallery_images
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_academy_registrations_updated_at
  BEFORE UPDATE ON academy_registrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- SEED DATA
-- =============================================================================

-- Minimal required seed: default settings keys the application will always read.
-- No sample products, collections, or users are seeded.

INSERT INTO settings (key, value, group_name, label, description, is_public) VALUES
  ('contact_email',    NULL, 'contact', 'Contact Email',    'Primary contact email address',         true),
  ('whatsapp_number',  NULL, 'contact', 'WhatsApp Number',  'WhatsApp contact number with country code', true),
  ('address',          NULL, 'contact', 'Address',          'Physical business address',             true),
  ('hero_title',       NULL, 'hero',    'Hero Title',        'Main heading on the homepage hero',     true),
  ('hero_subtitle',    NULL, 'hero',    'Hero Subtitle',     'Subheading on the homepage hero',       true),
  ('footer_tagline',   NULL, 'footer',  'Footer Tagline',    'Tagline displayed in the footer',       true),
  ('social_links',     NULL, 'social',  'Social Links',      'Social media URLs as JSON object',      true);
