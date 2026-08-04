-- 개인 백로그(보드 대시보드 하단 레일)를 위해 personal_tasks를 확장한다.
--
-- board_id      : 어느 보드에서 적었나. NULL이면 기존 마이스페이스 전역 항목.
-- promoted_*    : 무엇으로 승격됐나. status=DONE + promoted_type IS NOT NULL 이 "승격됨"이다.
--                 (PersonalTaskStatus enum에 값을 추가하면 마이스페이스 기존 화면이 전부
--                  새 상태를 처리해야 하므로 enum은 건드리지 않는다)

DO $$ BEGIN
    ALTER TABLE personal_tasks ADD COLUMN board_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE personal_tasks ADD COLUMN promoted_type VARCHAR(20);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE personal_tasks ADD COLUMN promoted_ref_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE personal_tasks ADD COLUMN promoted_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 레일 조회는 항상 (내 것) + (이 보드) + (상태) 로 걸린다
CREATE INDEX IF NOT EXISTS idx_personal_task_user_board
    ON personal_tasks(user_id, board_id, status);
