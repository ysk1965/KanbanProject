-- features 테이블에 is_inbox 컬럼 추가 (보드별 "미분류" 인박스 Feature 식별)
DO $$ BEGIN
    ALTER TABLE features ADD COLUMN is_inbox BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 보드당 인박스 Feature는 최대 1개 (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_features_board_inbox
    ON features (board_id) WHERE is_inbox = true AND deleted_at IS NULL;
