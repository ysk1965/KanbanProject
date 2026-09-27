-- 마이 스페이스 「기능」 탭: 기능별 문서(JSON 한 덩어리) + 추천 용어 기억
-- 기획서: docs/Design/myspace-features-timetable.html §06

CREATE TABLE IF NOT EXISTS personal_feature_docs (
    id          VARCHAR(36)  PRIMARY KEY,
    user_id     VARCHAR(36)  NOT NULL,
    feature_key VARCHAR(40)  NOT NULL,            -- 'timetable' …
    title       VARCHAR(200) NOT NULL,
    content     JSONB        NOT NULL,            -- 기능별 스키마, schema_ver로 구분
    schema_ver  INTEGER      NOT NULL DEFAULT 1,
    created_at  TIMESTAMP    NOT NULL,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP                          -- 소프트 삭제, 30일 뒤 하드 삭제
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pfd_user') THEN
        ALTER TABLE personal_feature_docs
            ADD CONSTRAINT fk_pfd_user FOREIGN KEY (user_id) REFERENCES users(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pfd_user_feature
    ON personal_feature_docs(user_id, feature_key, updated_at DESC);

CREATE TABLE IF NOT EXISTS personal_feature_terms (
    id           VARCHAR(36)  PRIMARY KEY,
    user_id      VARCHAR(36)  NOT NULL,
    feature_key  VARCHAR(40)  NOT NULL,
    field        VARCHAR(60)  NOT NULL,           -- 열 이름: '장소' · '비고' …
    value        VARCHAR(300) NOT NULL,
    color        VARCHAR(16),                     -- 마지막으로 함께 쓴 색 이름
    use_count    INTEGER      NOT NULL DEFAULT 1,
    last_used_at TIMESTAMP    NOT NULL
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_pft_user_field_value') THEN
        ALTER TABLE personal_feature_terms
            ADD CONSTRAINT uq_pft_user_field_value UNIQUE (user_id, feature_key, field, value);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pft_lookup
    ON personal_feature_terms(user_id, feature_key, field, last_used_at DESC);
