-- JIRA 양방향 댓글 동기화 (v1: 생성 + 삭제)
--  · jira_comment_links : BRIDGE 댓글 ↔ JIRA 코멘트 1:1 원장 (에코 루프 차단 + 삭제 대상 역참조)
--  · jira_integration_configs.comment_sync_enabled : 보드별 기능 토글 (기본 off)

CREATE TABLE IF NOT EXISTS jira_comment_links (
    id              VARCHAR(36) PRIMARY KEY,
    board_id        VARCHAR(36) NOT NULL,
    comment_id      VARCHAR(36) NOT NULL,
    task_id         VARCHAR(36) NOT NULL,
    jira_issue_key  VARCHAR(50) NOT NULL,
    jira_comment_id VARCHAR(30) NOT NULL,
    origin          VARCHAR(10) NOT NULL,
    created_at      TIMESTAMP   NOT NULL,
    updated_at      TIMESTAMP   NOT NULL
);

-- comment_id에는 의도적으로 FK를 걸지 않는다.
-- BRIDGE 댓글이 삭제된 뒤(AFTER_COMMIT) 이 행을 읽어 JIRA 쪽 삭제를 전파해야 하기 때문.
CREATE INDEX IF NOT EXISTS idx_jira_comment_link_comment ON jira_comment_links(comment_id);
CREATE INDEX IF NOT EXISTS idx_jira_comment_link_task ON jira_comment_links(board_id, task_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_jira_comment_link_board_jira
    ON jira_comment_links(board_id, jira_comment_id);

DO $$ BEGIN
    ALTER TABLE jira_integration_configs
        ADD COLUMN comment_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
