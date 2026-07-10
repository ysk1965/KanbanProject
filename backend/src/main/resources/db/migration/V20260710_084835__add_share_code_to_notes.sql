-- 노트 공개 공유 링크 단축용 짧은 코드(base62). 기존 share_token(UUID)과 병행.
-- 신규 링크는 /n/{share_code}, 레거시 /n|/shared/note/{share_token}(UUID)도 계속 조회 가능.

-- 컬럼 추가 (멱등)
DO $$ BEGIN
    ALTER TABLE notes ADD COLUMN share_code VARCHAR(16);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 유니크 제약 (멱등) — NULL은 유니크 대상에서 제외되므로 미공유 노트 다수 허용
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_notes_share_code') THEN
        ALTER TABLE notes ADD CONSTRAINT uk_notes_share_code UNIQUE (share_code);
    END IF;
END $$;
