-- JIRA 미러 모드: 블록에 JIRA 상태 미러 표시용 컬럼 + config에 동기화 방식 컬럼

-- blocks.jira_status_id : 이 블록이 미러링하는 JIRA 상태 id (null이면 일반 블록)
DO $$ BEGIN
    ALTER TABLE blocks ADD COLUMN jira_status_id VARCHAR(64);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_blocks_jira_status
    ON blocks(board_id, jira_status_id);

-- jira_integration_configs.sync_mode : MANUAL(레거시) / MIRROR(신규)
DO $$ BEGIN
    ALTER TABLE jira_integration_configs ADD COLUMN sync_mode VARCHAR(20) NOT NULL DEFAULT 'MANUAL';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
