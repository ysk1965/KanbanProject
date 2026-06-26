-- 외주 숨김 플래그 추가 (워크로드 뷰에서 숨기기). 멱등.
DO $$ BEGIN
    ALTER TABLE board_contractors ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
