-- JIRA 연동: 보드별 연결 설정 + 이슈 링크 원장 + 담당자 매핑
-- 멱등 작성 (IF NOT EXISTS / DO $$ 가드). local(H2)은 Flyway off + ddl-auto라 무영향, dev/prod만 적용.
-- PostgreSQL 전용 문법 사용.

-- ① 보드별 JIRA 연결 설정 (board 1 ↔ config 1)
CREATE TABLE IF NOT EXISTS jira_integration_configs (
    id                          VARCHAR(36) PRIMARY KEY,
    board_id                    VARCHAR(36) NOT NULL,
    base_url                    VARCHAR(200),
    cloud_id                    VARCHAR(100),
    project_key                 VARCHAR(50),
    jql                         VARCHAR(1000),
    auth_type                   VARCHAR(20) NOT NULL DEFAULT 'API_TOKEN',
    account_email               VARCHAR(200),
    api_token_encrypted         VARCHAR(500),
    refresh_token_encrypted     VARCHAR(500),
    token_expires_at            TIMESTAMP,
    connected_by                VARCHAR(36) NOT NULL,
    status_to_block_json        TEXT,
    priority_to_tag_json        TEXT,
    component_to_tag_json       TEXT,
    milestone_auto_assign       BOOLEAN NOT NULL DEFAULT TRUE,
    write_back_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
    write_back_target_status_id VARCHAR(30),
    status                      VARCHAR(20) NOT NULL DEFAULT 'CONNECTED',
    last_synced_at              TIMESTAMP,
    last_error                  VARCHAR(500),
    active                      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMP NOT NULL,
    updated_at                  TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_jira_config_board ON jira_integration_configs(board_id);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_jira_config_board') THEN
        ALTER TABLE jira_integration_configs
            ADD CONSTRAINT fk_jira_config_board FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_jira_config_user') THEN
        ALTER TABLE jira_integration_configs
            ADD CONSTRAINT fk_jira_config_user FOREIGN KEY (connected_by) REFERENCES users(id);
    END IF;
END $$;

-- ② 이슈 링크 원장 (재가져오기 중복 방지 · 증분 · 역동기화 역참조)
CREATE TABLE IF NOT EXISTS jira_issue_links (
    id                 VARCHAR(36) PRIMARY KEY,
    board_id           VARCHAR(36) NOT NULL,
    jira_issue_key     VARCHAR(50) NOT NULL,
    jira_issue_id      VARCHAR(30),
    target_type        VARCHAR(20) NOT NULL,
    target_id          VARCHAR(36) NOT NULL,
    jira_updated_at    TIMESTAMP,
    last_imported_at   TIMESTAMP NOT NULL,
    write_back_done_at TIMESTAMP,
    created_at         TIMESTAMP NOT NULL,
    updated_at         TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_jira_link_board_key ON jira_issue_links(board_id, jira_issue_key);
CREATE INDEX IF NOT EXISTS idx_jira_link_board ON jira_issue_links(board_id);
CREATE INDEX IF NOT EXISTS idx_jira_link_target ON jira_issue_links(target_type, target_id);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_jira_link_board') THEN
        ALTER TABLE jira_issue_links
            ADD CONSTRAINT fk_jira_link_board FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ③ 담당자 매핑 (JIRA accountId ↔ BRIDGE 멤버)
CREATE TABLE IF NOT EXISTS jira_user_mappings (
    id                VARCHAR(36) PRIMARY KEY,
    board_id          VARCHAR(36) NOT NULL,
    jira_account_id   VARCHAR(128) NOT NULL,
    jira_display_name VARCHAR(200),
    bridge_user_id    VARCHAR(36),
    created_at        TIMESTAMP NOT NULL,
    updated_at        TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_jira_user_map_board_account ON jira_user_mappings(board_id, jira_account_id);
CREATE INDEX IF NOT EXISTS idx_jira_user_map_board ON jira_user_mappings(board_id);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_jira_user_map_board') THEN
        ALTER TABLE jira_user_mappings
            ADD CONSTRAINT fk_jira_user_map_board FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_jira_user_map_user') THEN
        ALTER TABLE jira_user_mappings
            ADD CONSTRAINT fk_jira_user_map_user FOREIGN KEY (bridge_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;
