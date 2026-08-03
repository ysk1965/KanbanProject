-- JIRA에서 원본 이슈가 삭제된 링크를 표시(soft-unlink). non-null이면 연동 해제 상태 —
-- pull/push/write-back 대상에서 제외되고, 카드에는 "JIRA 삭제됨" 뱃지가 붙는다.
DO $$ BEGIN
    ALTER TABLE jira_issue_links ADD COLUMN jira_deleted_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
