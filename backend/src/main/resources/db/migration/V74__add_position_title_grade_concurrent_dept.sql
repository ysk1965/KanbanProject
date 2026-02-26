-- 직책 (Position within team: Lead, 팀장, PO, etc.)
CREATE TABLE IF NOT EXISTS organization_positions (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC'),
    UNIQUE (organization_id, name)
);

-- 직위 (Title: 사원, 대리, 과장, etc.)
CREATE TABLE IF NOT EXISTS organization_titles (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC'),
    UNIQUE (organization_id, name)
);

-- 직급 (Grade/Level: Level1, Level2, etc.)
CREATE TABLE IF NOT EXISTS organization_grades (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC'),
    UNIQUE (organization_id, name)
);

-- Add position, title, grade to organization_members
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS position_id VARCHAR(36) REFERENCES organization_positions(id) ON DELETE SET NULL;
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS title_id VARCHAR(36) REFERENCES organization_titles(id) ON DELETE SET NULL;
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS grade_id VARCHAR(36) REFERENCES organization_grades(id) ON DELETE SET NULL;

-- 겸직 (Concurrent department assignments)
CREATE TABLE IF NOT EXISTS organization_member_concurrent_depts (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    member_id VARCHAR(36) NOT NULL REFERENCES organization_members(id) ON DELETE CASCADE,
    department_id VARCHAR(36) NOT NULL REFERENCES organization_departments(id) ON DELETE CASCADE,
    position_id VARCHAR(36) REFERENCES organization_positions(id) ON DELETE SET NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    UNIQUE (member_id, department_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_positions_org ON organization_positions(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_titles_org ON organization_titles(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_grades_org ON organization_grades(organization_id);
CREATE INDEX IF NOT EXISTS idx_orgmember_position ON organization_members(organization_id, position_id);
CREATE INDEX IF NOT EXISTS idx_orgmember_title ON organization_members(organization_id, title_id);
CREATE INDEX IF NOT EXISTS idx_orgmember_grade ON organization_members(organization_id, grade_id);
CREATE INDEX IF NOT EXISTS idx_org_concurrent_member ON organization_member_concurrent_depts(member_id);
CREATE INDEX IF NOT EXISTS idx_org_concurrent_dept ON organization_member_concurrent_depts(department_id);
