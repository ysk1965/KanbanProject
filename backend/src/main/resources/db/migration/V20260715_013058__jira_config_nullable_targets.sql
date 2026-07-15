-- JIRA 연동: OAuth 대기(pending site selection) 상태에서는 base_url·cloud_id·project_key·jql·
-- account_email 이 아직 null이다. 그런데 dev DB에 초기 Hibernate auto-DDL로 만들어진 NOT NULL
-- 제약이 남아 있어 콜백 저장이 'null value in column "base_url" violates not-null constraint'로 실패.
-- 엔티티/원본 Flyway 정의(nullable)에 맞춰 NOT NULL을 제거한다.
-- DROP NOT NULL은 이미 nullable인 컬럼에 실행해도 무해(멱등). local(H2)은 Flyway off라 무영향.

ALTER TABLE jira_integration_configs ALTER COLUMN base_url      DROP NOT NULL;
ALTER TABLE jira_integration_configs ALTER COLUMN cloud_id      DROP NOT NULL;
ALTER TABLE jira_integration_configs ALTER COLUMN project_key   DROP NOT NULL;
ALTER TABLE jira_integration_configs ALTER COLUMN jql           DROP NOT NULL;
ALTER TABLE jira_integration_configs ALTER COLUMN account_email DROP NOT NULL;
