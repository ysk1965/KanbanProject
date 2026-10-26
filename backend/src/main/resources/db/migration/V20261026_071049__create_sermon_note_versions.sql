-- 설교 노트 버전 기록 — 노트(personal_feature_docs, feature_key='sermon')마다 최근 30개
-- 계약서: docs/Tech/sermon-note-versions-api.md
-- note_id 는 personal_feature_docs.id 지만 FK 는 걸지 않는다 (노트 소프트 삭제 때 서비스가 지우고,
-- 30일 뒤 하드 삭제 스케줄러를 막지 않게)

CREATE TABLE IF NOT EXISTS sermon_note_versions (
    id          VARCHAR(36)  PRIMARY KEY,          -- 기기에서 만든 id (같은 id 로 다시 올리면 그대로)
    user_id     VARCHAR(36)  NOT NULL,
    note_id     VARCHAR(36)  NOT NULL,
    reason      VARCHAR(10)  NOT NULL,             -- open / auto / close / restore
    title       VARCHAR(200),
    body        TEXT         NOT NULL,
    chars       INTEGER      NOT NULL,
    at          TIMESTAMP    NOT NULL,             -- 기기 시각 (UTC)
    created_at  TIMESTAMP    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sermon_note_versions_note ON sermon_note_versions(user_id, note_id, at DESC);
