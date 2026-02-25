-- =============================================
-- V61: Leave Management Tables
-- =============================================

-- 1. Leave Policies
CREATE TABLE IF NOT EXISTS leave_policies (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    leave_category VARCHAR(20) NOT NULL,
    default_days DECIMAL(4,1) NOT NULL DEFAULT 0,
    is_paid BOOLEAN NOT NULL DEFAULT true,
    requires_approval BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    display_order INT DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP,
    CONSTRAINT fk_leavepolicy_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT chk_leave_category CHECK (leave_category IN ('ANNUAL', 'SICK', 'REFRESH', 'OTHER')),
    CONSTRAINT chk_default_days_positive CHECK (default_days >= 0)
);

CREATE INDEX idx_leavepolicy_org ON leave_policies(organization_id);

-- 2. Leave Balances
CREATE TABLE IF NOT EXISTS leave_balances (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL,
    member_id VARCHAR(36) NOT NULL,
    policy_id VARCHAR(36) NOT NULL,
    leave_year INT NOT NULL,
    total_days DECIMAL(4,1) NOT NULL DEFAULT 0,
    used_days DECIMAL(4,1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP,
    CONSTRAINT fk_leavebal_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_leavebal_member FOREIGN KEY (member_id) REFERENCES organization_members(id) ON DELETE CASCADE,
    CONSTRAINT fk_leavebal_policy FOREIGN KEY (policy_id) REFERENCES leave_policies(id),
    CONSTRAINT uq_leave_balance UNIQUE (member_id, policy_id, leave_year),
    CONSTRAINT chk_total_days_positive CHECK (total_days >= 0),
    CONSTRAINT chk_used_days_positive CHECK (used_days >= 0)
);

CREATE INDEX idx_leavebal_member ON leave_balances(member_id);
CREATE INDEX idx_leavebal_org_year ON leave_balances(organization_id, leave_year);

-- 3. Leave Requests
CREATE TABLE IF NOT EXISTS leave_requests (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL,
    requester_id VARCHAR(36),
    policy_id VARCHAR(36) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    duration_type VARCHAR(20) NOT NULL DEFAULT 'FULL_DAY',
    total_days DECIMAL(4,1) NOT NULL,
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    reviewer_id VARCHAR(36),
    reviewed_at TIMESTAMP,
    review_comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP,
    CONSTRAINT fk_leavereq_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_leavereq_requester FOREIGN KEY (requester_id) REFERENCES organization_members(id) ON DELETE SET NULL,
    CONSTRAINT fk_leavereq_policy FOREIGN KEY (policy_id) REFERENCES leave_policies(id),
    CONSTRAINT fk_leavereq_reviewer FOREIGN KEY (reviewer_id) REFERENCES organization_members(id) ON DELETE SET NULL,
    CONSTRAINT chk_duration_type CHECK (duration_type IN ('FULL_DAY', 'AM_HALF', 'PM_HALF')),
    CONSTRAINT chk_leave_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED')),
    CONSTRAINT chk_date_range CHECK (end_date >= start_date),
    CONSTRAINT chk_half_day_single_date CHECK (duration_type = 'FULL_DAY' OR start_date = end_date),
    CONSTRAINT chk_total_days_positive CHECK (total_days > 0)
);

CREATE INDEX idx_leavereq_org_date ON leave_requests(organization_id, start_date);
CREATE INDEX idx_leavereq_requester ON leave_requests(requester_id);
CREATE INDEX idx_leavereq_status ON leave_requests(organization_id, status);
CREATE INDEX idx_leavereq_org_status_date ON leave_requests(organization_id, status, start_date, end_date);
CREATE INDEX idx_leavereq_reviewer ON leave_requests(reviewer_id);
