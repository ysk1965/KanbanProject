-- 설교 노트 「나의 갈피」 이름표 + 대표 말씀 연대기
-- 소속 교회는 여기 두지 않는다 (챌린지 user_churches 가 원본)
-- 계약서: docs/Tech/sermon-profile-api.md

CREATE TABLE IF NOT EXISTS sermon_profiles (
    user_id       VARCHAR(36)  PRIMARY KEY,
    mascot        VARCHAR(20)  NOT NULL,          -- galpi / dong / bang / banjjak
    mascot_state  VARCHAR(20)  NOT NULL,          -- idle / listen / done / think / sleep
    ink           VARCHAR(20)  NOT NULL,          -- sermonLook INKS id
    verse_ref     VARCHAR(24),                    -- encRef "44:5:3-4" (1~3절)
    verse_style   VARCHAR(10)  NOT NULL,          -- serif / hand
    visibility    VARCHAR(10)  NOT NULL,          -- private / groups / link
    pins          JSONB        NOT NULL,          -- [{note_id, ink, pattern, sticker, line}] 최대 3
    created_at    TIMESTAMP    NOT NULL,
    updated_at    TIMESTAMP    NOT NULL
);

CREATE TABLE IF NOT EXISTS sermon_profile_verses (
    id         VARCHAR(36)  PRIMARY KEY,
    user_id    VARCHAR(36)  NOT NULL,
    verse_ref  VARCHAR(24)  NOT NULL,
    from_at    TIMESTAMP    NOT NULL,
    to_at      TIMESTAMP                          -- null = 지금 대표 말씀
);

CREATE INDEX IF NOT EXISTS idx_spv_user_from ON sermon_profile_verses(user_id, from_at);
