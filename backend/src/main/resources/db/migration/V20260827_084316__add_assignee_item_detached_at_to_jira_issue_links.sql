-- 담당 항목을 사람이 지운 카드 기록 — JIRA 담당자 변경이 지운 항목을 재생성하지 않도록.
DO $$ BEGIN
    ALTER TABLE jira_issue_links ADD COLUMN assignee_item_detached_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
