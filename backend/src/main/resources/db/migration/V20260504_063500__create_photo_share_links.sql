-- photo_share_links: 다중 발급 + 만료/회수/접근 통계
CREATE TABLE IF NOT EXISTS photo_share_links (
    id                VARCHAR(36) PRIMARY KEY,
    organization_id   VARCHAR(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tab_id            VARCHAR(36) REFERENCES org_photo_tabs(id) ON DELETE CASCADE,
    link_type         VARCHAR(20) NOT NULL,
    token             VARCHAR(36) NOT NULL UNIQUE,
    title             VARCHAR(100),
    expires_at        TIMESTAMP,
    revoked_at        TIMESTAMP,
    revoked_by        VARCHAR(36) REFERENCES users(id),
    last_accessed_at  TIMESTAMP,
    access_count      INTEGER NOT NULL DEFAULT 0,
    created_by        VARCHAR(36) NOT NULL REFERENCES users(id),
    created_at        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_photo_share_links_link_type') THEN
        ALTER TABLE photo_share_links
            ADD CONSTRAINT chk_photo_share_links_link_type
            CHECK (link_type IN ('VIEW', 'UPLOAD'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_psl_org_active
    ON photo_share_links(organization_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_psl_tab_active
    ON photo_share_links(tab_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_psl_token_active
    ON photo_share_links(token) WHERE revoked_at IS NULL;

-- ============================================================
-- 백필: 기존 단일 토큰들을 photo_share_links로 이관 (멱등)
-- 기존 컬럼은 보존 (롤백 안전성). 후속 정리 마이그레이션에서 drop.
-- ============================================================

-- 1) 탭 단위 보기 토큰: org_photo_tabs.share_token (만료 없음)
INSERT INTO photo_share_links
    (id, organization_id, tab_id, link_type, token, expires_at, created_by, created_at, updated_at)
SELECT
    gen_random_uuid()::text,
    t.organization_id,
    t.id,
    'VIEW',
    t.share_token,
    NULL,
    COALESCE(t.created_by, (SELECT om.user_id FROM organization_members om
                            WHERE om.organization_id = t.organization_id AND om.role = 'OWNER'
                            LIMIT 1)),
    t.created_at,
    t.updated_at
FROM org_photo_tabs t
WHERE t.share_token IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM photo_share_links psl WHERE psl.token = t.share_token);

-- 2) 탭 단위 업로드 토큰: org_photo_tabs.upload_token (만료 있음)
INSERT INTO photo_share_links
    (id, organization_id, tab_id, link_type, token, expires_at, created_by, created_at, updated_at)
SELECT
    gen_random_uuid()::text,
    t.organization_id,
    t.id,
    'UPLOAD',
    t.upload_token,
    t.upload_token_expires_at,
    COALESCE(t.created_by, (SELECT om.user_id FROM organization_members om
                            WHERE om.organization_id = t.organization_id AND om.role = 'OWNER'
                            LIMIT 1)),
    t.created_at,
    t.updated_at
FROM org_photo_tabs t
WHERE t.upload_token IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM photo_share_links psl WHERE psl.token = t.upload_token);

-- 3) 갤러리 전체 보기 토큰: organizations.photo_share_token (만료 없음)
INSERT INTO photo_share_links
    (id, organization_id, tab_id, link_type, token, title, expires_at, created_by, created_at, updated_at)
SELECT
    gen_random_uuid()::text,
    o.id,
    NULL,
    'VIEW',
    o.photo_share_token,
    o.photo_share_title,
    NULL,
    (SELECT om.user_id FROM organization_members om
     WHERE om.organization_id = o.id AND om.role = 'OWNER' LIMIT 1),
    NOW() AT TIME ZONE 'UTC',
    NOW() AT TIME ZONE 'UTC'
FROM organizations o
WHERE o.photo_share_token IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM photo_share_links psl WHERE psl.token = o.photo_share_token);

-- 4) 갤러리 전체 업로드 토큰: organizations.photo_upload_token (만료 있음)
INSERT INTO photo_share_links
    (id, organization_id, tab_id, link_type, token, expires_at, created_by, created_at, updated_at)
SELECT
    gen_random_uuid()::text,
    o.id,
    NULL,
    'UPLOAD',
    o.photo_upload_token,
    o.photo_upload_token_expires_at,
    (SELECT om.user_id FROM organization_members om
     WHERE om.organization_id = o.id AND om.role = 'OWNER' LIMIT 1),
    NOW() AT TIME ZONE 'UTC',
    NOW() AT TIME ZONE 'UTC'
FROM organizations o
WHERE o.photo_upload_token IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM photo_share_links psl WHERE psl.token = o.photo_upload_token);
