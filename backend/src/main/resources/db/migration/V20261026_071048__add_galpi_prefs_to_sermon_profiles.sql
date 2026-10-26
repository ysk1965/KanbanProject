-- 「나의 갈피」 이름표에 자동 갈피 설정 두 개 — null = 아직 정한 적 없음 (응답 기본값: galpi_auto=true)
-- 계약서: docs/Tech/sermon-profile-api.md

DO $$ BEGIN
    ALTER TABLE sermon_profiles ADD COLUMN galpi_auto BOOLEAN;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE sermon_profiles ADD COLUMN galpi_service VARCHAR(60);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
