-- 보드별 리포트 AI 모델 선택. null이면 서버 기본(티어 설정값)을 쓴다.
DO $$ BEGIN
    ALTER TABLE board_report_configs ADD COLUMN ai_model VARCHAR(60);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
