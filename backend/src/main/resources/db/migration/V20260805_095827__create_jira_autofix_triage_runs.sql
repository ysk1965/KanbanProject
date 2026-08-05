-- 트리아지 실행 원장.
--
-- 트리아지는 이슈 15건당 AI 호출 한 번이라 100건이면 수 분이 걸린다. 동기 응답으로는
-- ALB idle timeout(90s)을 넘겨 504가 나므로, 실행은 백그라운드로 보내고 화면은 이 표를
-- 폴링해 진행률을 본다. 인스턴스가 여러 대라 진행 상태를 메모리에 둘 수 없다.

CREATE TABLE IF NOT EXISTS jira_autofix_triage_runs (
    id             VARCHAR(36) PRIMARY KEY,
    board_id       VARCHAR(36) NOT NULL,
    status         VARCHAR(20) NOT NULL,
    -- 보드에서 발견한 JIRA 연동 태스크 총 수
    scanned        INTEGER NOT NULL DEFAULT 0,
    -- 이번 실행이 판정할 대상 수(진행률의 분모)
    total          INTEGER NOT NULL DEFAULT 0,
    -- 지금까지 반영된 판정 수(진행률의 분자)
    triaged        INTEGER NOT NULL DEFAULT 0,
    -- 이슈가 안 바뀌어 건너뛴 수
    skipped        INTEGER NOT NULL DEFAULT 0,
    failed_batches INTEGER NOT NULL DEFAULT 0,
    -- 범위를 좁힌 실행이면 true. 화면 문구가 달라진다
    scoped         BOOLEAN NOT NULL DEFAULT FALSE,
    error_message  VARCHAR(500),
    started_by     VARCHAR(36),
    started_at     TIMESTAMP NOT NULL,
    -- 심장박동. 러너 프로세스가 죽으면 이 값이 멈추고, 그걸로 유령 실행을 판별한다
    updated_at     TIMESTAMP NOT NULL,
    finished_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jira_autofix_triage_run_board
    ON jira_autofix_triage_runs(board_id, started_at DESC);
