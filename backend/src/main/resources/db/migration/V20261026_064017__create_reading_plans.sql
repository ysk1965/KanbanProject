-- 함께 읽는 길: 통독 길(모임 길 · 나의 길) · 날 · 장 도장
-- 계약서: docs/Tech/sermon-reading-plans-api.md

CREATE TABLE IF NOT EXISTS reading_plans (
    id            VARCHAR(36)  PRIMARY KEY,
    group_id      VARCHAR(36)  REFERENCES sermon_groups(id) ON DELETE CASCADE,  -- 모임 길
    owner_user_id VARCHAR(36),                                                   -- 나의 길
    title         VARCHAR(40)  NOT NULL,
    template      VARCHAR(20)  NOT NULL,          -- mark16 / pp31 / nt90 / bible365 / custom (표시용)
    status        VARCHAR(10)  NOT NULL,          -- active / done / ended
    start_date    DATE         NOT NULL,
    end_date      DATE         NOT NULL,
    created_by    VARCHAR(36)  NOT NULL,
    created_at    TIMESTAMP    NOT NULL,
    updated_at    TIMESTAMP
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_rp_one_owner') THEN
        ALTER TABLE reading_plans ADD CONSTRAINT ck_rp_one_owner
            CHECK ((group_id IS NULL) <> (owner_user_id IS NULL));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rp_group_status ON reading_plans(group_id, status);
CREATE INDEX IF NOT EXISTS idx_rp_owner_status ON reading_plans(owner_user_id, status);

-- 모임당 진행 중인 길은 하나 (동시에 만들기 경합 방지)
CREATE UNIQUE INDEX IF NOT EXISTS uq_rp_group_active ON reading_plans(group_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS reading_plan_days (
    id       VARCHAR(36) PRIMARY KEY,
    plan_id  VARCHAR(36) NOT NULL REFERENCES reading_plans(id) ON DELETE CASCADE,
    day_no   INTEGER     NOT NULL,                -- 1부터
    date     DATE        NOT NULL,
    chapters JSONB       NOT NULL                 -- ["40:1", "40:2"]
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_rpd_plan_day') THEN
        ALTER TABLE reading_plan_days ADD CONSTRAINT uq_rpd_plan_day UNIQUE (plan_id, day_no);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS reading_checks (
    id      VARCHAR(36) PRIMARY KEY,
    plan_id VARCHAR(36) NOT NULL REFERENCES reading_plans(id) ON DELETE CASCADE,
    day_no  INTEGER     NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    chapter VARCHAR(8)  NOT NULL,                 -- "40:9"
    via     VARCHAR(10) NOT NULL,                 -- scroll / manual
    read_at TIMESTAMP   NOT NULL
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_rc_plan_day_user_chapter') THEN
        ALTER TABLE reading_checks ADD CONSTRAINT uq_rc_plan_day_user_chapter UNIQUE (plan_id, day_no, user_id, chapter);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rc_plan_user ON reading_checks(plan_id, user_id);
