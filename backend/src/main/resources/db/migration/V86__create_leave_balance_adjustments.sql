-- Leave Balance Adjustments: 휴가 잔여 조정 이력 관리
CREATE TABLE IF NOT EXISTS leave_balance_adjustments (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL,
    balance_id VARCHAR(36) NOT NULL,
    member_id VARCHAR(36),
    policy_id VARCHAR(36) NOT NULL,
    adjustment_type VARCHAR(20) NOT NULL,
    days DECIMAL(4,1) NOT NULL,
    previous_total DECIMAL(4,1) NOT NULL,
    new_total DECIMAL(4,1) NOT NULL,
    reason TEXT NOT NULL,
    granted_by VARCHAR(36),
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT fk_leaveadj_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_leaveadj_balance FOREIGN KEY (balance_id) REFERENCES leave_balances(id),
    CONSTRAINT fk_leaveadj_member FOREIGN KEY (member_id) REFERENCES organization_members(id) ON DELETE SET NULL,
    CONSTRAINT fk_leaveadj_policy FOREIGN KEY (policy_id) REFERENCES leave_policies(id),
    CONSTRAINT fk_leaveadj_granted_by FOREIGN KEY (granted_by) REFERENCES organization_members(id) ON DELETE SET NULL,
    CONSTRAINT chk_adjustment_type CHECK (adjustment_type IN ('GRANT', 'REVOKE', 'MANUAL_ADJUST', 'ANNUAL_INIT'))
);

CREATE INDEX idx_leaveadj_org_created ON leave_balance_adjustments(organization_id, created_at DESC);
CREATE INDEX idx_leaveadj_member_created ON leave_balance_adjustments(member_id, created_at DESC);
CREATE INDEX idx_leaveadj_balance ON leave_balance_adjustments(balance_id);
