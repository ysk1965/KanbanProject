-- 블록별 프로그레스바 표시 토글 (커스텀 블록에서 체크리스트 완료 비율 표시)
DO $$ BEGIN
    ALTER TABLE blocks ADD COLUMN show_progress_bar BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
