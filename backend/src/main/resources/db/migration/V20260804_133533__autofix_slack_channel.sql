-- 자동수정 결과를 게시할 슬랙 채널.
-- 비어 있으면 알림을 보내지 않는다 — 기존 보드는 컬럼이 null이라 동작이 그대로다.

DO $$ BEGIN
    ALTER TABLE jira_integration_configs ADD COLUMN autofix_slack_channel_id VARCHAR(40);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE jira_integration_configs ADD COLUMN autofix_slack_channel_name VARCHAR(100);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
