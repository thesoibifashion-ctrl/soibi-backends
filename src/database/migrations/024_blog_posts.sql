CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  excerpt TEXT NULL,
  content TEXT NOT NULL,
  cover_image_url TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT blog_posts_slug_unique UNIQUE (slug),
  CONSTRAINT blog_posts_status_check CHECK (status IN ('draft', 'published'))
);

CREATE INDEX idx_blog_posts_published_at ON blog_posts (published_at DESC)
  WHERE status = 'published';

CREATE TRIGGER blog_posts_set_updated_at BEFORE UPDATE ON blog_posts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
