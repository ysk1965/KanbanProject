-- ai_usage_logs.feature_type 를 VARCHAR(20) → VARCHAR(40) 으로 확장한다.
-- "REPORT_COMMIT_CLASSIFY"(22자) 등 신규 리포트 feature_type 이 20자를 초과해
-- 리포트 발송 시 DataIntegrityViolationException(value too long) 이 발생했다.
-- ALTER COLUMN TYPE 로의 varchar 길이 확장은 PostgreSQL 에서 메타데이터 변경만
-- 발생하므로 안전하며, 동일 타입으로의 재실행도 무해(멱등)하다.

ALTER TABLE ai_usage_logs ALTER COLUMN feature_type TYPE VARCHAR(40);
