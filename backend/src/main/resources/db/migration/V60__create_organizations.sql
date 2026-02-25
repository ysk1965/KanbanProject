-- =============================================
-- V60: Organization Service - Core Tables
-- =============================================

-- 1. Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    logo_url VARCHAR(500),
    owner_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP,
    CONSTRAINT fk_org_owner FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE INDEX idx_org_owner ON organizations(owner_id);
CREATE INDEX idx_org_deleted ON organizations(deleted_at);
CREATE INDEX idx_org_active ON organizations(id) WHERE deleted_at IS NULL;

-- 2. Organization Departments (configurable)
CREATE TABLE IF NOT EXISTS organization_departments (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP,
    CONSTRAINT fk_orgdept_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT uq_orgdept_name UNIQUE (organization_id, name)
);

-- 3. Organization Job Groups (configurable)
CREATE TABLE IF NOT EXISTS organization_job_groups (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP,
    CONSTRAINT fk_orgjob_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT uq_orgjob_name UNIQUE (organization_id, name)
);

-- 4. Organization Members
CREATE TABLE IF NOT EXISTS organization_members (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    department_id VARCHAR(36),
    job_group_id VARCHAR(36),
    job_title VARCHAR(100),
    contract_type VARCHAR(20) DEFAULT 'FULL_TIME',
    work_status VARCHAR(20) DEFAULT 'ACTIVE',
    employee_id VARCHAR(50),
    phone VARCHAR(30),
    birth_date DATE,
    hire_date DATE,
    bio TEXT,
    joined_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    invited_by VARCHAR(36),
    display_order INT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP,
    CONSTRAINT fk_orgmember_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_orgmember_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_orgmember_dept FOREIGN KEY (department_id) REFERENCES organization_departments(id) ON DELETE SET NULL,
    CONSTRAINT fk_orgmember_jobgroup FOREIGN KEY (job_group_id) REFERENCES organization_job_groups(id) ON DELETE SET NULL,
    CONSTRAINT fk_orgmember_inviter FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_org_user UNIQUE (organization_id, user_id),
    CONSTRAINT chk_org_role CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
    CONSTRAINT chk_contract_type CHECK (contract_type IN ('FULL_TIME', 'CONTRACT', 'INTERN', 'PART_TIME')),
    CONSTRAINT chk_work_status CHECK (work_status IN ('ACTIVE', 'ON_LEAVE', 'RESIGNED'))
);

CREATE INDEX idx_orgmember_org ON organization_members(organization_id);
CREATE INDEX idx_orgmember_user ON organization_members(user_id);
CREATE INDEX idx_orgmember_dept ON organization_members(organization_id, department_id);
CREATE INDEX idx_orgmember_status ON organization_members(organization_id, work_status);

-- 5. Add organization_id to boards (nullable FK)
ALTER TABLE boards ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36);
ALTER TABLE boards ADD CONSTRAINT fk_board_org FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE boards ADD CONSTRAINT chk_org_board_type CHECK (organization_id IS NULL OR board_type = 'TEAM');
CREATE INDEX idx_board_org ON boards(organization_id);

-- 6. Organization Invite Links
CREATE TABLE IF NOT EXISTS organization_invite_links (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    role VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    max_uses INT,
    used_count INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by VARCHAR(36),
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT fk_orginvite_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_orginvite_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_orginvite_role CHECK (role IN ('ADMIN', 'MEMBER'))
);

CREATE INDEX idx_orginvite_code ON organization_invite_links(code);
CREATE INDEX idx_orginvite_org ON organization_invite_links(organization_id);
