CREATE TABLE member_slack_webhooks (
    id              VARCHAR(36)  PRIMARY KEY,
    board_id        VARCHAR(36)  NOT NULL,
    user_id         VARCHAR(36)  NOT NULL,
    webhook_url     VARCHAR(500) NOT NULL,
    channel_name    VARCHAR(100),
    enabled         BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_slack_board_user UNIQUE (board_id, user_id),
    CONSTRAINT fk_slack_board FOREIGN KEY (board_id) REFERENCES boards(id),
    CONSTRAINT fk_slack_user  FOREIGN KEY (user_id)  REFERENCES users(id)
);

CREATE INDEX idx_slack_webhook_board_enabled ON member_slack_webhooks(board_id, enabled);
