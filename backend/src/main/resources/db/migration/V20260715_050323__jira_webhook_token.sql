-- JIRA 웹훅 수신용 보드별 시크릿 토큰 (Phase 4 근실시간 pull)
-- JIRA Automation/웹훅이 POST 시 이 토큰으로 보드를 식별·검증한다. 멱등.
DO $$ BEGIN
    ALTER TABLE jira_integration_configs ADD COLUMN webhook_token VARCHAR(64);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
