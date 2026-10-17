-- 체크리스트 프리셋 항목에 담당자 지정 컬럼 추가 (적용 시 체크 항목 담당자로 복사)
DO $$ BEGIN
    ALTER TABLE checklist_preset_items ADD COLUMN assignee_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
