-- Organization Notes: notes, note_tags, note_comments에 organization_id 추가
-- notes.board_id를 nullable로 변경하여 org 전용 노트 지원

-- 1. notes 테이블
DO $$ BEGIN
    ALTER TABLE notes ALTER COLUMN board_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE notes ADD COLUMN organization_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_notes_organization') THEN
        ALTER TABLE notes ADD CONSTRAINT fk_notes_organization
            FOREIGN KEY (organization_id) REFERENCES organizations(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notes_organization_id ON notes(organization_id);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_notes_scope') THEN
        ALTER TABLE notes ADD CONSTRAINT chk_notes_scope CHECK (
            (board_id IS NOT NULL AND organization_id IS NULL) OR
            (board_id IS NULL AND organization_id IS NOT NULL)
        );
    END IF;
END $$;

-- 2. note_tags 테이블
DO $$ BEGIN
    ALTER TABLE note_tags ALTER COLUMN board_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE note_tags ADD COLUMN organization_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_note_tags_organization') THEN
        ALTER TABLE note_tags ADD CONSTRAINT fk_note_tags_organization
            FOREIGN KEY (organization_id) REFERENCES organizations(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_note_tags_organization_id ON note_tags(organization_id);

-- 3. note_comments 테이블
DO $$ BEGIN
    ALTER TABLE note_comments ALTER COLUMN board_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE note_comments ADD COLUMN organization_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_note_comments_organization') THEN
        ALTER TABLE note_comments ADD CONSTRAINT fk_note_comments_organization
            FOREIGN KEY (organization_id) REFERENCES organizations(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_note_comments_organization_id ON note_comments(organization_id);
