-- system_config 에 변경 주체(updated_by)를 남긴다.
-- AI API 키처럼 민감한 값을 관리자 대시보드에서 교체할 수 있게 되면서,
-- "누가 언제 바꿨는지" 추적이 없으면 장애 원인 규명이 불가능하다.
DO $$ BEGIN
    ALTER TABLE system_config ADD COLUMN updated_by VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
