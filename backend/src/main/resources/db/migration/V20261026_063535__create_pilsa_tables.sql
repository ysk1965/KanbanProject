-- 설교 노트 챌린지 「이번 주 말씀 필사」
-- 계약서: docs/Tech/sermon-pilsa-api.md

-- 한 주 일곱 장 계획 (그 주에 처음 받은 것을 고정)
CREATE TABLE IF NOT EXISTS pilsa_plans (
    id          VARCHAR(36)  PRIMARY KEY,
    user_id     VARCHAR(36)  NOT NULL,
    week        DATE         NOT NULL,             -- 챌린지 주 키(월요일)
    chapters    TEXT         NOT NULL,             -- JSON 배열 [{b, c, reason, verses}]
    created_at  TIMESTAMP    NOT NULL,
    CONSTRAINT uq_pilsa_plans_user_week UNIQUE (user_id, week)
);

-- 쓴 절 (지우지 않는다)
CREATE TABLE IF NOT EXISTS pilsa_verses (
    id          VARCHAR(36)  PRIMARY KEY,
    user_id     VARCHAR(36)  NOT NULL,
    week        DATE         NOT NULL,
    book        INTEGER      NOT NULL,             -- 0 = 창세기 … 65 = 요한계시록
    chapter     INTEGER      NOT NULL,
    verse       INTEGER      NOT NULL,
    chars       INTEGER      NOT NULL,
    ms          INTEGER      NOT NULL,
    created_at  TIMESTAMP    NOT NULL,
    CONSTRAINT uq_pilsa_verses_user_week_bcv UNIQUE (user_id, week, book, chapter, verse)
);

CREATE INDEX IF NOT EXISTS idx_pilsa_verses_user_week ON pilsa_verses(user_id, week);
