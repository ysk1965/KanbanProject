-- Create member_discord_webhooks table (idempotent)
CREATE TABLE IF NOT EXISTS member_discord_webhooks (
    id           VARCHAR(36)  NOT NULL,
    board_id     VARCHAR(36)  NOT NULL,
    user_id      VARCHAR(36)  NOT NULL,
    webhook_url  VARCHAR(500) NOT NULL,
    channel_name VARCHAR(100),
    enabled      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMP    NOT NULL,
    updated_at   TIMESTAMP    NOT NULL,
    CONSTRAINT pk_member_discord_webhooks PRIMARY KEY (id),
    CONSTRAINT fk_discord_webhook_board FOREIGN KEY (board_id) REFERENCES boards (id) ON DELETE CASCADE,
    CONSTRAINT fk_discord_webhook_user  FOREIGN KEY (user_id)  REFERENCES users (id)  ON DELETE CASCADE
);

-- Unique constraint on (board_id, user_id)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uk_discord_webhook_board_user'
    ) THEN
        ALTER TABLE member_discord_webhooks
            ADD CONSTRAINT uk_discord_webhook_board_user UNIQUE (board_id, user_id);
    END IF;
END $$;

-- Index on (board_id, enabled) for efficient notification lookups
CREATE INDEX IF NOT EXISTS idx_discord_webhook_board_enabled
    ON member_discord_webhooks (board_id, enabled);
