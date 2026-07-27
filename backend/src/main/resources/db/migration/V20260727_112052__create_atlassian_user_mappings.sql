-- Atlassian 계정(accountId) ↔ BRIDGE 멤버 매핑.
--
-- Confluence 문서의 작성/수정자는 accountId로만 오는데, 그 값을 그대로 보고서에 노출하면
-- "70121:24b5829d-..." 같은 문자열이 사람 이름 자리에 박힌다. 한 번 해결한 매핑을 여기 적재해
-- 이후 수집은 DB 조회만으로 이름을 붙인다.
--
-- accountId는 Jira·Confluence가 공유하는 조직 단위 식별자라, 이 표는 두 제품 모두에 쓸 수 있다
-- (기존 jira_user_mappings는 그대로 두고, 해결 사다리에서 읽어와 승격한다).
--
-- bridge_user_id 가 NULL = "보드 멤버로는 이어지지 않은 계정"(외부 편집자 등).
-- 이 경우에도 display_name 은 채워 두어 보고서에 사람 이름이 보이게 하고,
-- 같은 accountId를 매번 다시 조회하지 않도록 캐시 역할을 한다.

CREATE TABLE IF NOT EXISTS atlassian_user_mappings (
    id                  VARCHAR(36) PRIMARY KEY,
    board_id            VARCHAR(36) NOT NULL,
    account_id          VARCHAR(128) NOT NULL,
    display_name        VARCHAR(200),
    bridge_user_id      VARCHAR(36),
    -- 어떤 경로로 이어졌는지: EMAIL(이메일 검색) | JIRA(기존 매핑 승격) | DISPLAY_NAME(이름 일치) | UNRESOLVED
    resolved_by         VARCHAR(20) NOT NULL DEFAULT 'UNRESOLVED',
    created_at          TIMESTAMP NOT NULL,
    updated_at          TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_atlassian_user_map_board_account
    ON atlassian_user_mappings(board_id, account_id);
CREATE INDEX IF NOT EXISTS idx_atlassian_user_map_board
    ON atlassian_user_mappings(board_id);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_atlassian_user_map_board') THEN
        ALTER TABLE atlassian_user_mappings
            ADD CONSTRAINT fk_atlassian_user_map_board
            FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_atlassian_user_map_user') THEN
        ALTER TABLE atlassian_user_mappings
            ADD CONSTRAINT fk_atlassian_user_map_user
            FOREIGN KEY (bridge_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;
