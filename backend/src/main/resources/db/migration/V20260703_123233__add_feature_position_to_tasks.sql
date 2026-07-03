-- 피처(서브태스크 리스트) 내 태스크 표시 순서 (position은 칸반 블록 내 순서라 별도 컬럼)
DO $$ BEGIN
    ALTER TABLE tasks ADD COLUMN feature_position INTEGER NOT NULL DEFAULT 0;
    -- 신규 컬럼 생성 시에만 실행: 기존 노출 순서(position)를 초기 순서로 백필
    UPDATE tasks SET feature_position = position;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_task_feature_position ON tasks(feature_id, feature_position);
