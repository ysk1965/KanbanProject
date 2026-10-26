-- 설교 노트 성경 읽기 「형광펜」 — 내가 칠한 구절
-- 계약서: docs/Tech/sermon-highlight-api.md

CREATE TABLE IF NOT EXISTS sermon_highlights (
    id          VARCHAR(36)  PRIMARY KEY,          -- 기기에서 만든 id (오프라인에서 먼저 칠한다)
    user_id     VARCHAR(36)  NOT NULL,
    book        SMALLINT     NOT NULL,             -- 0 = 창세기 … 65 = 요한계시록
    chapter     SMALLINT     NOT NULL,
    verse_from  SMALLINT     NOT NULL,
    verse_to    SMALLINT     NOT NULL,
    char_start  INTEGER,                           -- verse_from 안의 시작 글자 (null = 절 처음부터)
    char_end    INTEGER,                           -- verse_to 안의 끝 글자 (null = 절 끝까지)
    color       VARCHAR(10),                       -- yellow / green / blue / pink (null = 색 없음)
    underline   BOOLEAN      NOT NULL DEFAULT FALSE,
    memo        VARCHAR(200),
    created_at  TIMESTAMP    NOT NULL,
    updated_at  TIMESTAMP    NOT NULL,
    deleted_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sermon_highlights_user_ch ON sermon_highlights(user_id, book, chapter);
