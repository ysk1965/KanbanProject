-- JIRA OAuth 토큰 컬럼 폭 확대
-- 암호화된 Atlassian access/refresh 토큰(긴 JWT)이 VARCHAR(500)를 초과하여
-- 콜백 저장 시 'value too long for type character varying(500)'로 실패 → TEXT로 변경.
-- ALTER ... TYPE TEXT는 이미 TEXT여도 무해(멱등). local(H2)은 Flyway off라 무영향, dev/prod만 적용.

ALTER TABLE jira_integration_configs ALTER COLUMN api_token_encrypted TYPE TEXT;
ALTER TABLE jira_integration_configs ALTER COLUMN refresh_token_encrypted TYPE TEXT;
