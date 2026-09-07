-- P2/P3: 마일스톤 스코프가 보드와 다른 JIRA 프로젝트를 통째로 비출 수 있게 확장.
-- project_key/agile_board_id/mirror_columns_json = 스코프 전용 미러, write_back_target_status_id = 스코프별 완료 전환.

DO $$ BEGIN
    ALTER TABLE jira_milestone_scopes ADD COLUMN project_key VARCHAR(50);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE jira_milestone_scopes ADD COLUMN agile_board_id VARCHAR(30);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE jira_milestone_scopes ADD COLUMN mirror_columns_json TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE jira_milestone_scopes ADD COLUMN write_back_target_status_id VARCHAR(30);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 프로젝트 스코프는 JQL이 선택이 된다 (null = project 전체). 멱등: 이미 nullable이면 no-op.
ALTER TABLE jira_milestone_scopes ALTER COLUMN jql DROP NOT NULL;
