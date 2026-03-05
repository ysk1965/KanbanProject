-- V90__create_org_photo_gallery.sql

CREATE TABLE org_photo_tabs (
    id                VARCHAR(36) PRIMARY KEY,
    organization_id   VARCHAR(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name              VARCHAR(50) NOT NULL,
    description       VARCHAR(200),
    cover_photo_id    VARCHAR(36),
    photo_count       INTEGER NOT NULL DEFAULT 0,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    created_by        VARCHAR(36) NOT NULL REFERENCES users(id),
    created_at        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TABLE org_photos (
    id                VARCHAR(36) PRIMARY KEY,
    tab_id            VARCHAR(36) NOT NULL REFERENCES org_photo_tabs(id) ON DELETE CASCADE,
    organization_id   VARCHAR(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    s3_key            VARCHAR(500) NOT NULL,
    thumbnail_key     VARCHAR(500),
    url               VARCHAR(500) NOT NULL,
    thumbnail_url     VARCHAR(500),
    original_filename VARCHAR(255) NOT NULL,
    file_size         BIGINT NOT NULL,
    content_type      VARCHAR(50) NOT NULL,
    width             INTEGER,
    height            INTEGER,
    caption           VARCHAR(300),
    uploaded_by       VARCHAR(36) NOT NULL REFERENCES users(id),
    created_at        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

-- 인덱스
CREATE INDEX idx_org_photo_tabs_org_id ON org_photo_tabs(organization_id);
CREATE INDEX idx_org_photos_tab_id ON org_photos(tab_id);
CREATE INDEX idx_org_photos_org_id ON org_photos(organization_id);
CREATE INDEX idx_org_photos_created_at ON org_photos(created_at DESC);
CREATE INDEX idx_org_photos_org_tab_created ON org_photos(organization_id, tab_id, created_at DESC);

-- cover_photo FK (org_photos 생성 후)
ALTER TABLE org_photo_tabs
    ADD CONSTRAINT fk_org_photo_tabs_cover
    FOREIGN KEY (cover_photo_id) REFERENCES org_photos(id) ON DELETE SET NULL;
