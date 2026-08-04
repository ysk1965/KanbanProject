-- 연결된 저장소의 자동 검증 기반 수준 (NONE / PARTIAL / MATURE)
-- 트리아지 판정 기준이 "자동 검증 가능한가"라, 저장소에 테스트가 실제로 있는지가 판정을 좌우한다.
-- 기존 행은 NULL로 남고 애플리케이션이 NONE으로 해석한다(틀렸을 때 비용이 작은 쪽).

DO $$ BEGIN
    ALTER TABLE jira_integration_configs ADD COLUMN autofix_test_infra VARCHAR(20);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_jira_autofix_test_infra') THEN
        ALTER TABLE jira_integration_configs
            ADD CONSTRAINT ck_jira_autofix_test_infra
            CHECK (autofix_test_infra IS NULL
                   OR autofix_test_infra IN ('NONE', 'PARTIAL', 'MATURE'));
    END IF;
END $$;
