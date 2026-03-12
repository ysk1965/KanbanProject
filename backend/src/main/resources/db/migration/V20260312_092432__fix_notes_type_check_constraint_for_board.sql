-- Fix: notes_type_check constraint (Hibernate DDL auto 생성) 가 BOARD 타입을 허용하지 않는 문제
-- V20260312_143000 에서 chk_notes_type만 처리했으나, 실제 DB에는 notes_type_check 이름으로 존재

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notes_type_check') THEN
        ALTER TABLE notes DROP CONSTRAINT notes_type_check;
    END IF;
END $$;

-- chk_notes_type 이 이미 존재하면 (V20260312_143000에서 생성) 스킵
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_notes_type') THEN
        ALTER TABLE notes ADD CONSTRAINT chk_notes_type CHECK (type IN ('FOLDER', 'DOCUMENT', 'BOARD'));
    END IF;
END $$;
