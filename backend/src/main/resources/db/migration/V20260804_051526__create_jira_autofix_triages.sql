-- 자동수정 트리아지 판정 원장 (JIRA 이슈 1건당 1행)
-- 판정 기준: "AI가 고칠 수 있는가"가 아니라 "고쳐졌음을 자동 검증할 수 있는가"

CREATE TABLE IF NOT EXISTS jira_autofix_triages (
    id              VARCHAR(36) PRIMARY KEY,
    board_id        VARCHAR(36) NOT NULL,
    jira_issue_key  VARCHAR(50) NOT NULL,
    task_id         VARCHAR(36),
    verdict         VARCHAR(20) NOT NULL,
    category        VARCHAR(30) NOT NULL,
    confidence      DOUBLE PRECISION NOT NULL,
    verification    VARCHAR(500),
    reason          VARCHAR(1000),
    jira_updated_at TIMESTAMP,
    model           VARCHAR(60),
    created_at      TIMESTAMP NOT NULL,
    updated_at      TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jira_triage_board
    ON jira_autofix_triages(board_id);

CREATE INDEX IF NOT EXISTS idx_jira_triage_verdict
    ON jira_autofix_triages(board_id, verdict);

-- 재실행 시 같은 이슈가 중복 판정되지 않도록
CREATE UNIQUE INDEX IF NOT EXISTS uq_jira_triage_board_key
    ON jira_autofix_triages(board_id, jira_issue_key);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_jira_triage_board') THEN
        ALTER TABLE jira_autofix_triages
            ADD CONSTRAINT fk_jira_triage_board
            FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_jira_triage_confidence') THEN
        ALTER TABLE jira_autofix_triages
            ADD CONSTRAINT ck_jira_triage_confidence
            CHECK (confidence >= 0 AND confidence <= 1);
    END IF;
END $$;
