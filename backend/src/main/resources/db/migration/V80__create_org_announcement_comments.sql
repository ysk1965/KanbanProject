CREATE TABLE org_announcement_comments (
    id VARCHAR(36) PRIMARY KEY,
    announcement_id VARCHAR(36) NOT NULL REFERENCES org_announcements(id) ON DELETE CASCADE,
    author_id VARCHAR(36) NOT NULL REFERENCES organization_members(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX idx_org_announcement_comments_announcement
    ON org_announcement_comments(announcement_id, created_at ASC);
