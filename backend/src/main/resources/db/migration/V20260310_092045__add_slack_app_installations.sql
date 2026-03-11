-- Slack App Installation table
CREATE TABLE IF NOT EXISTS slack_installations (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36),
    organization_id VARCHAR(36),
    scope VARCHAR(20) NOT NULL,
    slack_team_id VARCHAR(20) NOT NULL,
    slack_team_name VARCHAR(200),
    bot_token_encrypted VARCHAR(500) NOT NULL,
    bot_user_id VARCHAR(20),
    installed_by VARCHAR(36) NOT NULL,
    slack_installer_user_id VARCHAR(20),
    default_channel_id VARCHAR(30),
    default_channel_name VARCHAR(100),
    scopes VARCHAR(1000),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_slack_install_board FOREIGN KEY (board_id) REFERENCES boards(id),
    CONSTRAINT fk_slack_install_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_slack_install_user FOREIGN KEY (installed_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_slack_install_board ON slack_installations(board_id);
CREATE INDEX IF NOT EXISTS idx_slack_install_org ON slack_installations(organization_id);
CREATE INDEX IF NOT EXISTS idx_slack_install_team ON slack_installations(slack_team_id);

-- Unique constraints (idempotent)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_slack_install_team_board') THEN
        ALTER TABLE slack_installations ADD CONSTRAINT uk_slack_install_team_board
            UNIQUE (slack_team_id, board_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_slack_install_team_org') THEN
        ALTER TABLE slack_installations ADD CONSTRAINT uk_slack_install_team_org
            UNIQUE (slack_team_id, organization_id);
    END IF;
END $$;

-- Check constraint: exactly one of board_id or organization_id must be non-null
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_slack_install_scope') THEN
        ALTER TABLE slack_installations ADD CONSTRAINT chk_slack_install_scope
            CHECK (
                (board_id IS NOT NULL AND organization_id IS NULL AND scope = 'BOARD')
                OR (board_id IS NULL AND organization_id IS NOT NULL AND scope = 'ORGANIZATION')
            );
    END IF;
END $$;

-- Slack Event Log (deduplication)
CREATE TABLE IF NOT EXISTS slack_event_logs (
    id VARCHAR(36) PRIMARY KEY,
    event_id VARCHAR(50) NOT NULL UNIQUE,
    event_type VARCHAR(50),
    processed_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_slack_event_id ON slack_event_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_slack_event_processed ON slack_event_logs(processed_at);
