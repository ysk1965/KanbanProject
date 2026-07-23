-- 마이스페이스 스토리지(개인 파일 보관함): 폴더 트리 + 파일
-- 노트의 3-way 스코프(owner_user_id / board_id / organization_id) 패턴을 채택.
-- 1차 구현은 개인(owner) 스코프만 사용하되, 향후 보드/조직 확장을 위해 컬럼을 함께 둔다.

-- ==================== storage_folder ====================
CREATE TABLE IF NOT EXISTS storage_folder (
    id              VARCHAR(36) PRIMARY KEY,
    owner_user_id   VARCHAR(36),
    board_id        VARCHAR(36),
    organization_id VARCHAR(36),
    parent_id       VARCHAR(36),
    name            VARCHAR(255) NOT NULL,
    position        INT NOT NULL DEFAULT 0,
    depth           INT NOT NULL DEFAULT 0,
    share_token     VARCHAR(36),
    share_code      VARCHAR(16),
    is_shared       BOOLEAN NOT NULL DEFAULT FALSE,
    created_by      VARCHAR(36) NOT NULL,
    updated_by      VARCHAR(36) NOT NULL,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at      TIMESTAMP,
    deleted_by_id   VARCHAR(36),
    created_at      TIMESTAMP NOT NULL,
    updated_at      TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_storage_folder_owner ON storage_folder(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_storage_folder_parent ON storage_folder(parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_storage_folder_share_code ON storage_folder(share_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_storage_folder_share_token ON storage_folder(share_token);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_storage_folder_scope') THEN
        ALTER TABLE storage_folder ADD CONSTRAINT chk_storage_folder_scope CHECK (
            (owner_user_id IS NOT NULL AND board_id IS NULL AND organization_id IS NULL) OR
            (owner_user_id IS NULL AND board_id IS NOT NULL AND organization_id IS NULL) OR
            (owner_user_id IS NULL AND board_id IS NULL AND organization_id IS NOT NULL)
        );
    END IF;
END $$;

-- ==================== storage_file ====================
CREATE TABLE IF NOT EXISTS storage_file (
    id                VARCHAR(36) PRIMARY KEY,
    owner_user_id     VARCHAR(36),
    board_id          VARCHAR(36),
    organization_id   VARCHAR(36),
    folder_id         VARCHAR(36),
    original_filename VARCHAR(255) NOT NULL,
    s3_key            VARCHAR(500) NOT NULL,
    thumbnail_key     VARCHAR(500),
    content_type      VARCHAR(100),
    file_size         BIGINT NOT NULL DEFAULT 0,
    width             INT,
    height            INT,
    share_token       VARCHAR(36),
    share_code        VARCHAR(16),
    is_shared         BOOLEAN NOT NULL DEFAULT FALSE,
    created_by        VARCHAR(36) NOT NULL,
    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at        TIMESTAMP,
    deleted_by_id     VARCHAR(36),
    created_at        TIMESTAMP NOT NULL,
    updated_at        TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_storage_file_owner ON storage_file(owner_user_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_storage_file_folder ON storage_file(folder_id, is_deleted);
CREATE UNIQUE INDEX IF NOT EXISTS uq_storage_file_share_code ON storage_file(share_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_storage_file_share_token ON storage_file(share_token);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_storage_file_scope') THEN
        ALTER TABLE storage_file ADD CONSTRAINT chk_storage_file_scope CHECK (
            (owner_user_id IS NOT NULL AND board_id IS NULL AND organization_id IS NULL) OR
            (owner_user_id IS NULL AND board_id IS NOT NULL AND organization_id IS NULL) OR
            (owner_user_id IS NULL AND board_id IS NULL AND organization_id IS NOT NULL)
        );
    END IF;
END $$;
