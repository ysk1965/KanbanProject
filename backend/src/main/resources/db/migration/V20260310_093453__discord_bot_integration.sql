-- ============================================================
-- Discord Bot Integration: replace webhook with Bot + OAuth2
-- ============================================================

-- 1. Create discord_bot_configs table (per-board bot configuration)
CREATE TABLE IF NOT EXISTS discord_bot_configs (
    id           VARCHAR(36)  NOT NULL,
    board_id     VARCHAR(36)  NOT NULL,
    guild_id     VARCHAR(30)  NOT NULL,
    guild_name   VARCHAR(200),
    channel_id   VARCHAR(30),
    channel_name VARCHAR(200),
    installed_by VARCHAR(36)  NOT NULL,
    created_at   TIMESTAMP    NOT NULL,
    updated_at   TIMESTAMP    NOT NULL,
    CONSTRAINT pk_discord_bot_configs PRIMARY KEY (id),
    CONSTRAINT fk_discord_bot_board FOREIGN KEY (board_id) REFERENCES boards (id) ON DELETE CASCADE,
    CONSTRAINT fk_discord_bot_installer FOREIGN KEY (installed_by) REFERENCES users (id) ON DELETE CASCADE
);

-- Unique: one bot config per board
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uk_discord_bot_config_board'
    ) THEN
        ALTER TABLE discord_bot_configs
            ADD CONSTRAINT uk_discord_bot_config_board UNIQUE (board_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_discord_bot_config_guild
    ON discord_bot_configs (guild_id);

-- 2. Create discord_user_links table (per-user Discord account linking)
CREATE TABLE IF NOT EXISTS discord_user_links (
    id               VARCHAR(36)  NOT NULL,
    user_id          VARCHAR(36)  NOT NULL,
    discord_user_id  VARCHAR(30)  NOT NULL,
    discord_username VARCHAR(100),
    access_token     VARCHAR(500),
    refresh_token    VARCHAR(500),
    token_expires_at TIMESTAMP,
    created_at       TIMESTAMP    NOT NULL,
    updated_at       TIMESTAMP    NOT NULL,
    CONSTRAINT pk_discord_user_links PRIMARY KEY (id),
    CONSTRAINT fk_discord_user_link_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Unique: one Discord account per BRIDGE user
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uk_discord_user_link_user'
    ) THEN
        ALTER TABLE discord_user_links
            ADD CONSTRAINT uk_discord_user_link_user UNIQUE (user_id);
    END IF;
END $$;

-- Unique: one BRIDGE user per Discord account
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uk_discord_user_link_discord'
    ) THEN
        ALTER TABLE discord_user_links
            ADD CONSTRAINT uk_discord_user_link_discord UNIQUE (discord_user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_discord_user_link_discord_id
    ON discord_user_links (discord_user_id);

-- 3. Drop old webhook table (no longer needed)
DROP TABLE IF EXISTS member_discord_webhooks;
