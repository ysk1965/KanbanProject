-- 버전 메모 (사용자 입력 또는 복원 시 자동 생성). 엔티티 필드명은 NoteVersion.memo, 컬럼명은 note.
DO $$ BEGIN
    ALTER TABLE note_versions ADD COLUMN note VARCHAR(500);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
