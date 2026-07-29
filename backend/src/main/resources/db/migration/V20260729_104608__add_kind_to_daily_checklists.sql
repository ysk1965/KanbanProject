-- 오늘의 체크리스트 개념 통합
-- daily_checklists 를 "오늘 목록의 원본"에서 "예외 지정(핀/제외) 테이블"로 재정의한다.
--   PIN     : 기간이 해당 날짜를 덮지 않지만 그 날 하기로 당겨온 항목 (기존 행 전부 여기에 해당)
--   EXCLUDE : 기간이 해당 날짜를 덮지만 그 날은 하지 않기로 한 항목
-- 오늘 목록 자체는 checklist_items.start_date~due_date 로부터 파생된다.

DO $$ BEGIN
    ALTER TABLE daily_checklists ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'PIN';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_daily_checklist_kind') THEN
        ALTER TABLE daily_checklists ADD CONSTRAINT ck_daily_checklist_kind
            CHECK (kind IN ('PIN', 'EXCLUDE'));
    END IF;
END $$;

-- 담당자+날짜 단위 조회(파생 병합 시 매번 수행)를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_daily_checklist_assignee_date
    ON daily_checklists(assignee_id, assigned_date);

-- 보드+날짜 단위 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_daily_checklist_board_date
    ON daily_checklists(board_id, assigned_date);
