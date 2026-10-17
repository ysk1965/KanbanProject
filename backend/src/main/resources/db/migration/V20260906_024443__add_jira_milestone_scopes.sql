-- 마일스톤별 JIRA 스코프: 연결(jira_integration_configs, 보드 1개)은 유지하고
-- 조회 범위(JQL)만 마일스톤 단위로 내린다. 테이블이 비어 있으면 기존 동작과 동일(보드 전체).

-- 스코프 테이블 (멱등)
CREATE TABLE IF NOT EXISTS jira_milestone_scopes (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36) NOT NULL,
    milestone_id VARCHAR(36) NOT NULL,
    jql VARCHAR(1000) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by VARCHAR(36),
    last_claimed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_jira_scope_milestone ON jira_milestone_scopes(milestone_id);
CREATE INDEX IF NOT EXISTS idx_jira_scope_board ON jira_milestone_scopes(board_id);

-- 이슈 링크의 소속 스코프 (멱등). null = 보드 기본(레거시 전체) — 스코프 없는 마일스톤과 전체 뷰가 본다.
DO $$ BEGIN
    ALTER TABLE jira_issue_links ADD COLUMN scope_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_jira_link_scope ON jira_issue_links(scope_id);
