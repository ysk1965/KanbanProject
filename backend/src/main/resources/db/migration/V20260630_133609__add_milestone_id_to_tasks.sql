-- 태스크 단위 마일스톤 배정: tasks.milestone_id 추가
-- 피처는 여러 마일스톤에 걸칠 수 있으나, 각 태스크는 그중 하나의 마일스톤에 배정된다.
-- (피처가 어떤 마일스톤에도 없으면 milestone_id는 NULL)

-- 1) 컬럼 추가 (멱등)
DO $$ BEGIN
    ALTER TABLE tasks ADD COLUMN milestone_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2) 인덱스 (멱등)
CREATE INDEX IF NOT EXISTS idx_task_milestone_id ON tasks(milestone_id);

-- 3) FK (마일스톤 삭제 시 태스크의 milestone_id를 NULL로) — 멱등
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_task_milestone') THEN
        ALTER TABLE tasks
            ADD CONSTRAINT fk_task_milestone
            FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 4) 백필: 기존 태스크를 피처의 대표(primary) 마일스톤으로 설정
UPDATE tasks t SET milestone_id = mf.milestone_id
FROM milestone_features mf
WHERE mf.feature_id = t.feature_id
  AND mf.is_primary = true
  AND t.milestone_id IS NULL
  AND t.deleted_at IS NULL;
