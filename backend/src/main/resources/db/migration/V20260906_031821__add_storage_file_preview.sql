-- 스토리지 문서 파일(docx/pptx/hwp 등)의 PDF 미리보기 변환 결과 키와 상태

DO $$ BEGIN
    ALTER TABLE storage_file ADD COLUMN preview_key VARCHAR(500);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE storage_file ADD COLUMN preview_status VARCHAR(20) NOT NULL DEFAULT 'NONE';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
