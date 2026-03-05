-- V90__create_org_photo_gallery.sql
-- Organization Photo Gallery: tables, indexes, sharing, org-level share token

-- 1. org_photo_tabs
CREATE TABLE IF NOT EXISTS org_photo_tabs (
    id                VARCHAR(36) PRIMARY KEY,
    organization_id   VARCHAR(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name              VARCHAR(50) NOT NULL,
    description       VARCHAR(200),
    cover_photo_id    VARCHAR(36),
    photo_count       INTEGER NOT NULL DEFAULT 0,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    share_token       VARCHAR(36) UNIQUE,
    is_shared         BOOLEAN NOT NULL DEFAULT FALSE,
    created_by        VARCHAR(36) NOT NULL REFERENCES users(id),
    created_at        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

-- 2. org_photos
CREATE TABLE IF NOT EXISTS org_photos (
    id                VARCHAR(36) PRIMARY KEY,
    tab_id            VARCHAR(36) NOT NULL REFERENCES org_photo_tabs(id) ON DELETE CASCADE,
    organization_id   VARCHAR(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    s3_key            VARCHAR(500) NOT NULL,
    thumbnail_key     VARCHAR(500),
    url               VARCHAR(500) NOT NULL,
    thumbnail_url     VARCHAR(500),
    original_filename VARCHAR(255) NOT NULL,
    file_size         BIGINT NOT NULL,
    content_type      VARCHAR(50),
    width             INTEGER,
    height            INTEGER,
    caption           VARCHAR(300),
    uploaded_by       VARCHAR(36) NOT NULL REFERENCES users(id),
    created_at        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_org_photo_tabs_org_id ON org_photo_tabs(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_photos_tab_id ON org_photos(tab_id);
CREATE INDEX IF NOT EXISTS idx_org_photos_org_id ON org_photos(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_photos_created_at ON org_photos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_photos_org_tab_created ON org_photos(organization_id, tab_id, created_at DESC);

-- 4. cover_photo FK (org_photos must exist first)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'org_photo_tabs'::regclass AND conname = 'fk_org_photo_tabs_cover'
    ) THEN
        ALTER TABLE org_photo_tabs
            ADD CONSTRAINT fk_org_photo_tabs_cover
            FOREIGN KEY (cover_photo_id) REFERENCES org_photos(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 5. Organization gallery-level share token
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'photo_share_token'
    ) THEN
        ALTER TABLE organizations ADD COLUMN photo_share_token VARCHAR(36) UNIQUE;
    END IF;
END $$;
