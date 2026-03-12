-- BOARD 타입을 notes.type CHECK 제약조건에 추가 (멱등)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_notes_type') THEN
        ALTER TABLE notes DROP CONSTRAINT chk_notes_type;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_notes_type') THEN
        ALTER TABLE notes ADD CONSTRAINT chk_notes_type CHECK (type IN ('FOLDER', 'DOCUMENT', 'BOARD'));
    END IF;
END $$;
