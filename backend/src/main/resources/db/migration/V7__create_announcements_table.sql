CREATE TABLE IF NOT EXISTS announcements (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    content TEXT,
    type VARCHAR(20) DEFAULT 'NOTICE',
    is_active BOOLEAN NOT NULL DEFAULT true,
    start_at TIMESTAMP,
    end_at TIMESTAMP,
    priority INTEGER DEFAULT 0,
    target_role VARCHAR(20),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_announcement_active ON announcements(is_active, start_at, end_at);
