-- planning_cards 테이블 생성
-- 일정 탭 "플래닝(Planning)" 서브탭의 임시업무 카드 저장
-- Board 삭제 시 CASCADE, User/Milestone/Task 삭제 시 SET NULL
CREATE TABLE IF NOT EXISTS planning_cards (
    id                    VARCHAR(36)       PRIMARY KEY,
    board_id              VARCHAR(36)       NOT NULL,
    title                 VARCHAR(200)      NOT NULL,
    description           TEXT,
    assignee_id           VARCHAR(36),
    week_start_date       DATE,
    primary_milestone_id  VARCHAR(36),
    estimated_hours       DOUBLE PRECISION,
    position              INTEGER           NOT NULL DEFAULT 0,
    color                 VARCHAR(16),
    created_by            VARCHAR(36),
    promoted_task_id      VARCHAR(36),
    promoted_at           TIMESTAMP,
    created_at            TIMESTAMP         NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP,
    CONSTRAINT chk_pc_hours_nonneg
        CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
    CONSTRAINT chk_pc_title_nonempty
        CHECK (length(btrim(title)) > 0),
    -- 월요일 제약: PostgreSQL EXTRACT(DOW FROM date) = 1 (0=일, 1=월, ..., 6=토)
    CONSTRAINT chk_pc_week_is_monday
        CHECK (week_start_date IS NULL OR EXTRACT(DOW FROM week_start_date) = 1)
);

-- FK: board_id → boards(id) ON DELETE CASCADE
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pc_board') THEN
        ALTER TABLE planning_cards ADD CONSTRAINT fk_pc_board
            FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE;
    END IF;
END $$;

-- FK: assignee_id → users(id) ON DELETE SET NULL
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pc_assignee') THEN
        ALTER TABLE planning_cards ADD CONSTRAINT fk_pc_assignee
            FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- FK: primary_milestone_id → milestones(id) ON DELETE SET NULL
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pc_primary_milestone') THEN
        ALTER TABLE planning_cards ADD CONSTRAINT fk_pc_primary_milestone
            FOREIGN KEY (primary_milestone_id) REFERENCES milestones(id) ON DELETE SET NULL;
    END IF;
END $$;

-- FK: created_by → users(id) ON DELETE SET NULL
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pc_created_by') THEN
        ALTER TABLE planning_cards ADD CONSTRAINT fk_pc_created_by
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- FK: promoted_task_id → tasks(id) ON DELETE SET NULL (Phase 2 슬롯)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pc_promoted_task') THEN
        ALTER TABLE planning_cards ADD CONSTRAINT fk_pc_promoted_task
            FOREIGN KEY (promoted_task_id) REFERENCES tasks(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_pc_board_id
    ON planning_cards(board_id);

CREATE INDEX IF NOT EXISTS idx_pc_board_assignee
    ON planning_cards(board_id, assignee_id);

CREATE INDEX IF NOT EXISTS idx_pc_board_week
    ON planning_cards(board_id, week_start_date);

CREATE INDEX IF NOT EXISTS idx_pc_board_milestone
    ON planning_cards(board_id, primary_milestone_id);

-- 셀 조회 최적화 (board_id + week_start_date + assignee_id 기준 정렬)
CREATE INDEX IF NOT EXISTS idx_pc_cell
    ON planning_cards(board_id, week_start_date, assignee_id, position);

-- Task 승격 역방향 조회 (Phase 2 슬롯)
CREATE INDEX IF NOT EXISTS idx_pc_promoted_task
    ON planning_cards(promoted_task_id);
