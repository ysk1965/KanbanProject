CREATE TABLE org_onboarding_instances (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    member_id VARCHAR(36) NOT NULL REFERENCES organization_members(id),
    source_template_id VARCHAR(36) REFERENCES org_onboarding_templates(id) ON DELETE SET NULL,
    template_name VARCHAR(100) NOT NULL,
    total_items INTEGER NOT NULL,
    completed_items INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TABLE org_onboarding_instance_items (
    id VARCHAR(36) PRIMARY KEY,
    instance_id VARCHAR(36) NOT NULL REFERENCES org_onboarding_instances(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description VARCHAR(500),
    due_date DATE,
    assignee_id VARCHAR(36) REFERENCES organization_members(id) ON DELETE SET NULL,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMP,
    completed_by VARCHAR(36) REFERENCES users(id),
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX idx_onboarding_inst_org ON org_onboarding_instances(organization_id);
CREATE INDEX idx_onboarding_inst_member ON org_onboarding_instances(member_id);
CREATE INDEX idx_onboarding_inst_items ON org_onboarding_instance_items(instance_id);
