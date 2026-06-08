-- 워크로드 "임시 업무(예정)" 바 지원을 위한 is_tentative 컬럼 추가.
-- true이면 세부 체크리스트 확정 전 워크로드에 미리 잡아둔 "예정" 항목으로,
-- 워크로드/캘린더(by-assignee) 조회에만 노출되고 카운트/진행률/통계/리포트에는 집계되지 않는다.
DO $$ BEGIN
    ALTER TABLE checklist_items ADD COLUMN is_tentative BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
