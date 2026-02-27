CREATE TABLE org_announcement_attachments (
    id VARCHAR(36) PRIMARY KEY,
    announcement_id VARCHAR(36) NOT NULL REFERENCES org_announcements(id) ON DELETE CASCADE,
    original_file_name VARCHAR(500) NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    url VARCHAR(500) NOT NULL,
    thumbnail_s3_key VARCHAR(500),
    thumbnail_url VARCHAR(500),
    content_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_org_announcement_attachment_announcement ON org_announcement_attachments(announcement_id);
