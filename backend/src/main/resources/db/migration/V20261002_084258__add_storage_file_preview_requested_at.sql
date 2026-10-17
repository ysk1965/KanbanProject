-- 문서 PDF 미리보기 변환 요청 시각.
-- (1) 대기 순번·경과 시간 계산, (2) 서버 재시작 등으로 영원히 PENDING 에 남은 행을 되돌리는 기준으로 쓴다.

DO $$ BEGIN
    ALTER TABLE storage_file ADD COLUMN preview_requested_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_storage_file_preview_pending
    ON storage_file (preview_status, preview_requested_at);
