-- 설교 노트 「챌린지」 1단계: 달란트 원장 · 지갑 · 주간 점수 · 게임 판 · 교회 · 랭킹 프로필 · 리그
-- 계약서: docs/Tech/sermon-challenge-api.md

-- 달란트 원장. 같은 award_key 는 seq 를 늘려 가며 적립(+)·상쇄(−)를 번갈아 쌓는다.
-- (user_id, award_key, award_seq) 유니크가 중복 적립을 막는다 — 부분 인덱스 없이 H2·PostgreSQL 공통.
CREATE TABLE IF NOT EXISTS talent_ledger (
    id              VARCHAR(36)  PRIMARY KEY,
    user_id         VARCHAR(36)  NOT NULL,
    amount          INTEGER      NOT NULL,
    reason          VARCHAR(20)  NOT NULL,          -- note / note_audio / apply / apply_done / galpi / ...
    award_key       VARCHAR(120) NOT NULL,
    award_seq       INTEGER      NOT NULL,
    source_id       VARCHAR(64),                    -- 문서 id / 게임 판 id / 교환 id
    label           VARCHAR(200),
    week            DATE         NOT NULL,          -- 이 행이 셈해지는 주(월요일, KST)
    counts_for_rank BOOLEAN      NOT NULL,
    created_at      TIMESTAMP    NOT NULL
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_tl_user_key_seq') THEN
        ALTER TABLE talent_ledger ADD CONSTRAINT uq_tl_user_key_seq UNIQUE (user_id, award_key, award_seq);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tl_user_created ON talent_ledger(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tl_user_source ON talent_ledger(user_id, source_id);
CREATE INDEX IF NOT EXISTS idx_tl_user_week_reason ON talent_ledger(user_id, week, reason);

CREATE TABLE IF NOT EXISTS talent_wallets (
    user_id     VARCHAR(36) PRIMARY KEY,
    balance     INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMP   NOT NULL,
    updated_at  TIMESTAMP
);

CREATE TABLE IF NOT EXISTS weekly_scores (
    id             VARCHAR(36) PRIMARY KEY,
    week           DATE        NOT NULL,
    user_id        VARCHAR(36) NOT NULL,
    talents        INTEGER     NOT NULL DEFAULT 0,
    rain_best      INTEGER,
    books_best_ms  INTEGER,
    created_at     TIMESTAMP   NOT NULL,
    updated_at     TIMESTAMP
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_ws_week_user') THEN
        ALTER TABLE weekly_scores ADD CONSTRAINT uq_ws_week_user UNIQUE (week, user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ws_week_talents ON weekly_scores(week, talents);
CREATE INDEX IF NOT EXISTS idx_ws_week_rain ON weekly_scores(week, rain_best);
CREATE INDEX IF NOT EXISTS idx_ws_week_books ON weekly_scores(week, books_best_ms);

CREATE TABLE IF NOT EXISTS game_runs (
    id           VARCHAR(36)  PRIMARY KEY,
    user_id      VARCHAR(36)  NOT NULL,
    game         VARCHAR(10)  NOT NULL,             -- rain / books
    stage        VARCHAR(20)  NOT NULL,             -- rain: set, books: pentateuch / ot / nt / all
    label        VARCHAR(200),
    seed         BIGINT       NOT NULL,
    payload      JSONB        NOT NULL,             -- rain: {"words": [...]}, books: {"cards": [...]}
    status       VARCHAR(10)  NOT NULL,             -- open / finished
    score        INTEGER,                           -- rain: 점수, books: duration_ms
    duration_ms  INTEGER,
    valid        BOOLEAN,
    talents      INTEGER,
    created_at   TIMESTAMP    NOT NULL,
    finished_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gr_user_game_stage ON game_runs(user_id, game, stage, created_at);

CREATE TABLE IF NOT EXISTS churches (
    id              VARCHAR(36)  PRIMARY KEY,
    name            VARCHAR(40)  NOT NULL,
    name_key        VARCHAR(40)  NOT NULL,          -- 공백 제거 · 소문자
    region          VARCHAR(40)  NOT NULL,
    address         VARCHAR(200),
    kakao_place_id  VARCHAR(40),                    -- 2단계(카카오 장소 검색)
    created_by      VARCHAR(36),
    created_at      TIMESTAMP    NOT NULL,
    updated_at      TIMESTAMP
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_church_name_region') THEN
        ALTER TABLE churches ADD CONSTRAINT uq_church_name_region UNIQUE (name_key, region);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_church_kakao_place') THEN
        ALTER TABLE churches ADD CONSTRAINT uq_church_kakao_place UNIQUE (kakao_place_id);
    END IF;
END $$;

-- 소속 교회. 빼면 church_id 만 null 로 두고 changed_at 은 남긴다(30일 제한)
CREATE TABLE IF NOT EXISTS user_churches (
    user_id     VARCHAR(36) PRIMARY KEY,
    church_id   VARCHAR(36),
    dept        VARCHAR(20),
    changed_at  TIMESTAMP,
    created_at  TIMESTAMP   NOT NULL,
    updated_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_uc_church ON user_churches(church_id);

CREATE TABLE IF NOT EXISTS ranking_profiles (
    user_id      VARCHAR(36) PRIMARY KEY,
    nickname     VARCHAR(12),
    tag          VARCHAR(4),
    anonymous    BOOLEAN     NOT NULL DEFAULT FALSE,
    anon_no      INTEGER     NOT NULL,
    league_tier  INTEGER     NOT NULL DEFAULT 0,
    created_at   TIMESTAMP   NOT NULL,
    updated_at   TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rp_nickname ON ranking_profiles(nickname);

CREATE TABLE IF NOT EXISTS league_members (
    id          VARCHAR(36) PRIMARY KEY,
    week        DATE        NOT NULL,
    user_id     VARCHAR(36) NOT NULL,
    tier        INTEGER     NOT NULL,
    cohort      INTEGER     NOT NULL,
    created_at  TIMESTAMP   NOT NULL
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_lm_week_user') THEN
        ALTER TABLE league_members ADD CONSTRAINT uq_lm_week_user UNIQUE (week, user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lm_week_tier_cohort ON league_members(week, tier, cohort);

CREATE TABLE IF NOT EXISTS league_results (
    id          VARCHAR(36) PRIMARY KEY,
    week        DATE        NOT NULL,
    user_id     VARCHAR(36) NOT NULL,
    tier        INTEGER     NOT NULL,
    cohort      INTEGER     NOT NULL,
    final_rank  INTEGER     NOT NULL,
    talents     INTEGER     NOT NULL,
    tier_from   INTEGER     NOT NULL,
    tier_to     INTEGER     NOT NULL,
    moved       VARCHAR(4)  NOT NULL,               -- up / stay / down
    created_at  TIMESTAMP   NOT NULL
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_lr_week_user') THEN
        ALTER TABLE league_results ADD CONSTRAINT uq_lr_week_user UNIQUE (week, user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lr_user_week ON league_results(user_id, week);

-- 달란트로 바꾼 리워드 AI 크레딧 (만료 있음)
DO $$ BEGIN
    ALTER TABLE users ADD COLUMN personal_reward_credits INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE users ADD COLUMN personal_reward_expires_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 모임 ↔ 교회 (2단계에서 사용)
DO $$ BEGIN
    ALTER TABLE sermon_groups ADD COLUMN church_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
