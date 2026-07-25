-- board_confluence_sources.match_rule 을 VARCHAR(20) → VARCHAR(40) 으로 확장한다.
-- "PARENT_TREE_CHANGELOG"(21자) 매칭 규칙이 20자를 초과해, 이 규칙으로 저장 시
-- DataIntegrityViolationException(value too long) 이 발생하며 PUT .../confluence/spaces 가 500 을 반환했다.
-- ALTER COLUMN TYPE 로의 varchar 길이 확장은 PostgreSQL 에서 메타데이터 변경만
-- 발생하므로 안전하며, 동일 타입으로의 재실행도 무해(멱등)하다.

ALTER TABLE board_confluence_sources ALTER COLUMN match_rule TYPE VARCHAR(40);
