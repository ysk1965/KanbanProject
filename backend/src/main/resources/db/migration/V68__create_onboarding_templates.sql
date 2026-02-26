CREATE TABLE org_onboarding_templates (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    auto_assign BOOLEAN NOT NULL DEFAULT true,
    target_department_id VARCHAR(36) REFERENCES organization_departments(id) ON DELETE SET NULL,
    target_job_group_id VARCHAR(36) REFERENCES organization_job_groups(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TABLE org_onboarding_template_items (
    id VARCHAR(36) PRIMARY KEY,
    template_id VARCHAR(36) NOT NULL REFERENCES org_onboarding_templates(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description VARCHAR(500),
    due_day_offset INTEGER,
    assignee_role VARCHAR(20),
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX idx_onboarding_tmpl_org ON org_onboarding_templates(organization_id);
CREATE INDEX idx_onboarding_tmpl_items ON org_onboarding_template_items(template_id);
