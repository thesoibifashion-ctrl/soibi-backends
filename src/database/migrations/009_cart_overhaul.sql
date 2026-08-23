-- Migration 009: Cart overhaul
-- Adds status lifecycle, snapshot columns, nullable product_id,
-- preserves guest-session carts, and creates cart_history table.

-- ─── 1. Replace the single profile-cart constraint with active-cart uniqueness ─
-- Keep session_id, expires_at, the guest-session unique constraint, and the
-- owner check so a cart still belongs to exactly one profile or guest session.
ALTER TABLE carts
  DROP CONSTRAINT IF EXISTS carts_profile_id_unique;

-- ─── 2. Add status to carts ───────────────────────────────────────────────────
ALTER TABLE carts
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';

ALTER TABLE carts
  ADD CONSTRAINT carts_status_check
    CHECK (status IN ('active', 'submitted', 'abandoned'));

-- One active cart per authenticated user (partial unique index). Guest-cart
-- ownership remains enforced by carts_session_id_unique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_profile_id_active
  ON carts(profile_id)
  WHERE profile_id IS NOT NULL AND status = 'active';

-- ─── 3. cart_items: add missing columns ──────────────────────────────────────
ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS image_url_snapshot    TEXT          NULL,
  ADD COLUMN IF NOT EXISTS product_name_snapshot TEXT          NULL,
  ADD COLUMN IF NOT EXISTS selected_color        TEXT          NULL,
  ADD COLUMN IF NOT EXISTS selected_material     TEXT          NULL,
  ADD COLUMN IF NOT EXISTS selected_size         NUMERIC(6,2)  NULL;

-- ─── 4. Make cart_items.product_id nullable ───────────────────────────────────
ALTER TABLE cart_items
  ALTER COLUMN product_id DROP NOT NULL;

-- ─── 5. cart_history table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cart_history (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  original_cart_id  UUID          NULL,
  profile_id        UUID          NOT NULL,
  items             JSONB         NOT NULL DEFAULT '[]',
  total_snapshot    NUMERIC(12,2) NOT NULL DEFAULT 0,
  completed_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT cart_history_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cart_history_profile_id ON cart_history(profile_id);
CREATE INDEX IF NOT EXISTS idx_cart_history_original_cart_id ON cart_history(original_cart_id);
