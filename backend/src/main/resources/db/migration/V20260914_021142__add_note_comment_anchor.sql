-- 노트 인라인 메모: note_comments에 텍스트 범위 앵커 컬럼 추가 (멱등)
DO $$ BEGIN
    ALTER TABLE note_comments ADD COLUMN anchor_text TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE note_comments ADD COLUMN anchor_prefix VARCHAR(64);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE note_comments ADD COLUMN anchor_suffix VARCHAR(64);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE note_comments ADD COLUMN anchor_start INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE note_comments ADD COLUMN anchor_end INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE note_comments ADD COLUMN anchor_status VARCHAR(16);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
