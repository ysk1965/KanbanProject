-- 자동수정 파이프라인: GitHub Actions 제거 → 맥 러너 pull(claim) 방식 전환
--
-- 러너가 작업을 가져가므로 "어느 러너가 물고 있는지"와 "러너가 살아 있는지"를 서버가 알아야 한다.
-- 또 Actions 실행 로그 링크가 사라졌으므로, 실패 원인을 볼 수 있게 로그 꼬리를 저장한다.
--
-- 기존 jira_autofix_jobs.workflow_file / run_url 컬럼은 더 이상 쓰지 않지만 남겨 둔다 —
-- 이미 쌓인 행의 이력이고, 지운다고 얻는 것이 없다.

-- 이 작업을 가져간 러너 이름
DO $$ BEGIN
    ALTER TABLE jira_autofix_jobs ADD COLUMN runner_name VARCHAR(100);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 에이전트 로그 꼬리 (실패 원인 표시용)
DO $$ BEGIN
    ALTER TABLE jira_autofix_jobs ADD COLUMN log_excerpt TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 마지막으로 러너가 말을 걸어온 시각 (claim / heartbeat)
DO $$ BEGIN
    ALTER TABLE jira_integration_configs ADD COLUMN autofix_runner_seen_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE jira_integration_configs ADD COLUMN autofix_runner_name VARCHAR(100);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
