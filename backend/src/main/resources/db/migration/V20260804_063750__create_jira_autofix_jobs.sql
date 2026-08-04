-- 자동수정 작업 큐 (JIRA 이슈 1건당 1행)
-- 디스패치 대상(저장소·워크플로·브랜치)은 큐에 담는 시점에 스냅샷한다 —
-- 보드의 저장소 연결이 바뀌어도 이미 큐에 있는 작업이 엉뚱한 곳으로 날아가지 않게 한다.

CREATE TABLE IF NOT EXISTS jira_autofix_jobs (
    id              VARCHAR(36) PRIMARY KEY,
    board_id        VARCHAR(36) NOT NULL,
    jira_issue_key  VARCHAR(50) NOT NULL,
    task_id         VARCHAR(36),
    status          VARCHAR(20) NOT NULL,
    confidence      DOUBLE PRECISION,
    installation_id VARCHAR(40),
    repo_full_name  VARCHAR(200),
    workflow_file   VARCHAR(100),
    base_ref        VARCHAR(200),
    pr_url          VARCHAR(500),
    run_url         VARCHAR(500),
    failure_reason  VARCHAR(1000),
    queued_at       TIMESTAMP NOT NULL,
    dispatched_at   TIMESTAMP,
    completed_at    TIMESTAMP,
    created_at      TIMESTAMP NOT NULL,
    updated_at      TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jira_autofix_job_board
    ON jira_autofix_jobs(board_id);

-- 큐 펌프가 매분 조회하는 경로
CREATE INDEX IF NOT EXISTS idx_jira_autofix_job_status
    ON jira_autofix_jobs(board_id, status);

-- "이슈당 1회" 가드레일 조회
CREATE INDEX IF NOT EXISTS idx_jira_autofix_job_key
    ON jira_autofix_jobs(board_id, jira_issue_key);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_jira_autofix_job_board') THEN
        ALTER TABLE jira_autofix_jobs
            ADD CONSTRAINT fk_jira_autofix_job_board
            FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_jira_autofix_job_status') THEN
        ALTER TABLE jira_autofix_jobs
            ADD CONSTRAINT ck_jira_autofix_job_status
            CHECK (status IN ('QUEUED', 'DISPATCHED', 'SUCCEEDED', 'NO_CHANGE',
                              'FAILED', 'TIMED_OUT', 'CANCELLED'));
    END IF;
END $$;

-- 러너 콜백 인증용 보드별 시크릿. JIRA 웹훅 토큰과 분리한다
-- (하나를 회전해도 다른 경로가 죽지 않아야 한다).
DO $$ BEGIN
    ALTER TABLE jira_integration_configs ADD COLUMN autofix_callback_token VARCHAR(64);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
