-- JIRA ⇄ BRIDGE QA 양방향 동기화 (Phase 1~3)
-- ① 블록↔JIRA status 방향 매핑(JSON)을 config에 추가 (기존 status_to_block_json 확장·공존)
-- ② Task에 QA 반영 필드(qa_state / qa_synced_at) 추가 (pull 읽기전용 뱃지·반려 표시용)
-- 모두 멱등 (IF NOT EXISTS / duplicate_column 무시).

-- ① 블록↔status 양방향 매핑 JSON
DO $$ BEGIN
    ALTER TABLE jira_integration_configs ADD COLUMN block_status_map_json TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ② Task QA 반영 필드 (읽기전용) — NULL|REVIEW|VERIFIED|REJECTED
DO $$ BEGIN
    ALTER TABLE tasks ADD COLUMN qa_state VARCHAR(20);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE tasks ADD COLUMN qa_synced_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
