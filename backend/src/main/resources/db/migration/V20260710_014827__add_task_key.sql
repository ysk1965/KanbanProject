-- 사람이 읽는 태스크 키 (예: STORY-42)
-- boards.key_prefix / task_seq + tasks.task_number / task_key
-- 백필(기존 보드 프리픽스 파생 + 태스크 번호 부여)은 TaskKeyBackfillRunner가 처리한다.

-- 1) boards 컬럼 (멱등)
DO $$ BEGIN
    ALTER TABLE boards ADD COLUMN key_prefix VARCHAR(10);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE boards ADD COLUMN task_seq INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2) tasks 컬럼 (멱등)
DO $$ BEGIN
    ALTER TABLE tasks ADD COLUMN task_number INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE tasks ADD COLUMN task_key VARCHAR(20);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 3) 유니크/조회 인덱스 (멱등)
-- Postgres는 UNIQUE 인덱스에서 NULL을 서로 다른 값으로 취급하므로 다중 NULL(미배정 행)을 허용한다.
CREATE UNIQUE INDEX IF NOT EXISTS uk_boards_key_prefix ON boards(UPPER(key_prefix));
CREATE UNIQUE INDEX IF NOT EXISTS uk_tasks_task_key ON tasks(task_key);
CREATE UNIQUE INDEX IF NOT EXISTS uk_tasks_board_number ON tasks(board_id, task_number);
CREATE INDEX IF NOT EXISTS idx_tasks_task_key ON tasks(task_key);
