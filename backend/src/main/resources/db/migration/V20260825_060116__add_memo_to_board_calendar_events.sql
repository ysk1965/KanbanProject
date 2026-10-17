-- 특별 일정 공유 메모: 이벤트당 1개, 마지막 수정 귀속만 기록
DO $$ BEGIN
    ALTER TABLE board_calendar_events ADD COLUMN memo TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE board_calendar_events ADD COLUMN memo_updated_by VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE board_calendar_events ADD COLUMN memo_updated_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
