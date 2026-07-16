-- JIRA 미러: 보드 컬럼 정의(JSON) 저장 컬럼. 한 컬럼이 여러 JIRA 상태를 묶는다.
DO $$ BEGIN
    ALTER TABLE jira_integration_configs ADD COLUMN mirror_columns_json TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
