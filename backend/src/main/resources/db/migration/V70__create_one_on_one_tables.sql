CREATE TABLE org_one_on_ones (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    member_a_id VARCHAR(36) NOT NULL REFERENCES organization_members(id),
    member_b_id VARCHAR(36) NOT NULL REFERENCES organization_members(id),
    recurrence_type VARCHAR(20),
    recurrence_day INTEGER,
    next_meeting_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT uq_one_on_one UNIQUE (organization_id, member_a_id, member_b_id),
    CONSTRAINT chk_different_members CHECK (member_a_id != member_b_id),
    CONSTRAINT chk_member_order CHECK (member_a_id < member_b_id)
);

CREATE TABLE org_one_on_one_meetings (
    id VARCHAR(36) PRIMARY KEY,
    one_on_one_id VARCHAR(36) NOT NULL REFERENCES org_one_on_ones(id),
    meeting_date DATE NOT NULL,
    agenda TEXT,
    notes TEXT,
    created_by VARCHAR(36) NOT NULL REFERENCES users(id),
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);
