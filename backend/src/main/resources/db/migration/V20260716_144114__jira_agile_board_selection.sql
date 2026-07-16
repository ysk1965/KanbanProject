-- 미러 대상 JIRA Agile 보드 선택 저장용 컬럼.
-- 프로젝트에 보드가 여러 개일 때(예: "현재 QA 보드" vs "잔존 이슈 보드")
-- 어느 보드의 컬럼 구성을 미러링할지 사용자가 고른 값을 보관. null=자동선택(첫 kanban 보드).
DO $$ BEGIN
    ALTER TABLE jira_integration_configs ADD COLUMN agile_board_id VARCHAR(30);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
