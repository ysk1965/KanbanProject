-- JIRA 반려 감지용 직전 status 기록 (Phase 4 옵션 B)
-- "검토 중 → 개발 블록" 전환을 반려로 인식하려면 링크에 직전 JIRA status를 저장해 비교한다. 멱등.
DO $$ BEGIN
    ALTER TABLE jira_issue_links ADD COLUMN last_jira_status_id VARCHAR(30);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
