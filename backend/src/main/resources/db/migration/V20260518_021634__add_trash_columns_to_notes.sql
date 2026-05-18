-- 노트 휴지통(복구함) 지원: 삭제 시각/주체 기록 + 휴지통 조회 인덱스
-- is_deleted 컬럼은 기존(V25)에 존재. deleted_at/deleted_by_id 만 추가.

-- 1) deleted_at: 휴지통 정렬 및 30일 자동 영구 삭제 기준
DO $$ BEGIN
    ALTER TABLE notes ADD COLUMN deleted_at TIMESTAMP NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2) deleted_by_id: 누가 삭제했는지
DO $$ BEGIN
    ALTER TABLE notes ADD COLUMN deleted_by_id VARCHAR(36) NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 3) deleted_by_id FK to users (사용자 삭제 시 SET NULL)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_notes_deleted_by'
    ) THEN
        ALTER TABLE notes
            ADD CONSTRAINT fk_notes_deleted_by
            FOREIGN KEY (deleted_by_id) REFERENCES users(id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- 4) 보드 스코프 휴지통 조회 인덱스 (deleted_at DESC 정렬용)
CREATE INDEX IF NOT EXISTS idx_notes_board_trash
    ON notes (board_id, deleted_at DESC)
    WHERE is_deleted = true;

-- 5) 조직 스코프 휴지통 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_notes_org_trash
    ON notes (organization_id, deleted_at DESC)
    WHERE is_deleted = true;

-- 6) 30일 경과 영구 삭제 스케줄러 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_notes_trash_expired
    ON notes (deleted_at)
    WHERE is_deleted = true;
