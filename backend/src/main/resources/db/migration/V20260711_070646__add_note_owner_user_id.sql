-- 개인(마이 스페이스) 노트 스코프: board_id / organization_id 와 나란히 owner_user_id 추가.
-- board_id·organization_id 는 이미 nullable 이라 세 스코프가 상호배타적으로 공존한다.
-- createdBy(감사용)와 분리된 명시적 소유권 컬럼.

-- notes.owner_user_id (개인 노트 소유자)
DO $$ BEGIN
    ALTER TABLE notes ADD COLUMN owner_user_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_notes_owner_user_id ON notes(owner_user_id);

-- note_tags.owner_user_id (개인 노트 태그 소유자)
DO $$ BEGIN
    ALTER TABLE note_tags ADD COLUMN owner_user_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_note_tags_owner_user_id ON note_tags(owner_user_id);
