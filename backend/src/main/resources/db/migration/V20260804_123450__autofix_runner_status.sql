-- 러너 자가진단 스냅샷 — 맥에 SSH로 들어가지 않고도 "왜 안 도는지"를 화면이 설명하기 위한 값.
--
-- 항목별 컬럼이 아니라 JSON 하나로 두는 이유: 러너가 점검하는 항목은 앞으로도 늘어난다.
-- 컬럼을 파면 러너 스크립트를 고칠 때마다 마이그레이션이 따라붙는다.
-- 서버가 아는 필드만 뽑아 다시 직렬화해 저장하므로 임의 값이 그대로 들어오지는 않는다.

DO $$ BEGIN
    ALTER TABLE jira_integration_configs ADD COLUMN autofix_runner_status VARCHAR(500);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
