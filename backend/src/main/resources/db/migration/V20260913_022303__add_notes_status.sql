-- 페이지 진행 상태 (DRAFT / IN_REVIEW / DONE). null = 미지정.
DO $$ BEGIN
    ALTER TABLE notes ADD COLUMN status VARCHAR(20);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_notes_status') THEN
        ALTER TABLE notes ADD CONSTRAINT chk_notes_status
            CHECK (status IS NULL OR status IN ('DRAFT', 'IN_REVIEW', 'DONE'));
    END IF;
END $$;
