-- 개인(마이 스페이스) 노트 지원: chk_notes_scope 제약을 owner_user_id 3-way로 확장.
-- 기존 제약(V20260315_125945)은 board_id XOR organization_id 만 허용해
-- board/org 둘 다 null 인 개인 노트 INSERT 를 막았다(→ 생성 시 500).
-- board / organization / owner 중 정확히 하나만 non-null 이도록 재정의.

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_notes_scope') THEN
        ALTER TABLE notes DROP CONSTRAINT chk_notes_scope;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_notes_scope') THEN
        ALTER TABLE notes ADD CONSTRAINT chk_notes_scope CHECK (
            (board_id IS NOT NULL AND organization_id IS NULL AND owner_user_id IS NULL) OR
            (board_id IS NULL AND organization_id IS NOT NULL AND owner_user_id IS NULL) OR
            (board_id IS NULL AND organization_id IS NULL AND owner_user_id IS NOT NULL)
        );
    END IF;
END $$;
