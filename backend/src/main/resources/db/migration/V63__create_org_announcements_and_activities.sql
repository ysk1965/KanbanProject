-- Organization Announcements
CREATE TABLE org_announcements (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    author_id VARCHAR(36) NOT NULL REFERENCES organization_members(id),
    title VARCHAR(200) NOT NULL,
    content TEXT,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_org_announcements_org ON org_announcements(organization_id, is_pinned DESC, created_at DESC);

-- Organization Activity Feed
CREATE TABLE org_activities (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    actor_name VARCHAR(100) NOT NULL,
    activity_type VARCHAR(50) NOT NULL,
    target_name VARCHAR(200),
    metadata JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_org_activities_org ON org_activities(organization_id, created_at DESC);
