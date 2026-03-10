-- Slack User Link table (per-user Slack account linking for DM notifications)
CREATE TABLE IF NOT EXISTS slack_user_links (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL UNIQUE,
    slack_user_id VARCHAR(30) NOT NULL UNIQUE,
    slack_username VARCHAR(200),
    slack_team_id VARCHAR(30),
    access_token VARCHAR(500),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_slack_user_link_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_slack_user_link_slack_id ON slack_user_links(slack_user_id);
