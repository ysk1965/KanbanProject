-- 보드 생성 시 자동 생성되는 "기본 마일스톤" 여부.
-- true인 동안(사용자가 편집 전)에는 기간이 지나도 overdue 경고를 띄우지 않는다.
-- updateInfo 편집 시 애플리케이션에서 false로 전환.
DO $$ BEGIN
    ALTER TABLE milestones ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
