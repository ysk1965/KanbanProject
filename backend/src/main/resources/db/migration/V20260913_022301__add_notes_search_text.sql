-- 노트 전문 검색용 소문자 평문 컬럼. 기존 행은 애플리케이션 부팅 시 NoteSearchTextBackfillRunner 가 채운다.
DO $$ BEGIN
    ALTER TABLE notes ADD COLUMN search_text TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- pg_trgm 확장이 이미 설치된 환경에서만 GIN trigram 인덱스 생성 (RDS 에서 CREATE EXTENSION 권한이 없을 수 있음).
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        CREATE INDEX IF NOT EXISTS idx_notes_search_text_trgm ON notes USING gin (search_text gin_trgm_ops);
    END IF;
END $$;
