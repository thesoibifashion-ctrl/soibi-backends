-- Add customer-editable contact and delivery profile fields.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT NULL
    CHECK (preferred_contact_method IN ('email', 'whatsapp')),
  ADD COLUMN IF NOT EXISTS country TEXT NULL,
  ADD COLUMN IF NOT EXISTS state TEXT NULL,
  ADD COLUMN IF NOT EXISTS city TEXT NULL,
  ADD COLUMN IF NOT EXISTS address TEXT NULL;

-- full_name already exists from the initial profiles schema.
