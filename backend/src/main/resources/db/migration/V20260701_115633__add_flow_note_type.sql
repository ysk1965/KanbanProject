-- FLOW 타입을 notes.type CHECK 제약조건에 추가 (멱등)
-- 제약조건 이름이 'chk_notes_type' (Flyway) 또는 'notes_type_check' (Hibernate DDL auto) 일 수 있음
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_notes_type') THEN
        ALTER TABLE notes DROP CONSTRAINT chk_notes_type;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notes_type_check') THEN
        ALTER TABLE notes DROP CONSTRAINT notes_type_check;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_notes_type') THEN
        ALTER TABLE notes ADD CONSTRAINT chk_notes_type CHECK (type IN ('FOLDER', 'DOCUMENT', 'BOARD', 'FLOW'));
    END IF;
END $$;
