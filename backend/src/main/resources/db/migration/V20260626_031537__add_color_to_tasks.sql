-- tasks 테이블에 color 컬럼 추가 (Task 자체 색상 — 카드 색이 feature 색 대신 task 색을 우선 따라감)
DO $$ BEGIN
    ALTER TABLE tasks ADD COLUMN color VARCHAR(20);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
