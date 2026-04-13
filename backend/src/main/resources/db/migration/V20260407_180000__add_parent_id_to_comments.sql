-- 댓글 답글 기능: parent_id 컬럼 추가
DO $$ BEGIN
    ALTER TABLE comments ADD COLUMN parent_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 자기 참조 외래 키
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_comment_parent') THEN
        ALTER TABLE comments ADD CONSTRAINT fk_comment_parent
            FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_comment_parent_id ON comments(parent_id);
