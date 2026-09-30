-- 사진첩 대량 업로드 (presigned PUT → confirm) 대기 목록
-- confirm 시 삭제, expires_at 이 지나도 남아 있으면 TempFileCleanupScheduler 가 S3 객체와 함께 정리
CREATE TABLE IF NOT EXISTS photo_upload_intents (
    id                VARCHAR(36)  PRIMARY KEY,
    s3_key            VARCHAR(500) NOT NULL,
    thumbnail_key     VARCHAR(500) NOT NULL,
    organization_id   VARCHAR(36)  NOT NULL,
    tab_id            VARCHAR(36)  NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    content_type      VARCHAR(50)  NOT NULL,
    uploaded_by       VARCHAR(36),
    created_at        TIMESTAMP    NOT NULL,
    expires_at        TIMESTAMP    NOT NULL
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_photo_upload_intent_s3_key') THEN
        ALTER TABLE photo_upload_intents ADD CONSTRAINT uk_photo_upload_intent_s3_key UNIQUE (s3_key);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_photo_upload_intent_expires ON photo_upload_intents(expires_at);

-- confirm 재요청(멱등) 시 s3_key 로 기존 사진 조회
CREATE INDEX IF NOT EXISTS idx_org_photos_s3_key ON org_photos(s3_key);
