CREATE TABLE org_custom_holidays (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    holiday_date DATE NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_recurring BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT uq_custom_holiday UNIQUE (organization_id, holiday_date)
);

CREATE INDEX idx_custom_holidays_org ON org_custom_holidays(organization_id, holiday_date);

CREATE TABLE org_attendance_policies (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL UNIQUE REFERENCES organizations(id),
    standard_hours DECIMAL(4,2) NOT NULL DEFAULT 8.00,
    core_time_start TIME,
    core_time_end TIME,
    late_threshold TIME,
    auto_clock_out BOOLEAN NOT NULL DEFAULT true,
    auto_clock_out_time TIME NOT NULL DEFAULT '23:59:00',
    weekend_days VARCHAR(20) NOT NULL DEFAULT '6,7',
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TABLE org_attendance_records (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    member_id VARCHAR(36) NOT NULL REFERENCES organization_members(id),
    record_date DATE NOT NULL,
    clock_in TIMESTAMP,
    clock_out TIMESTAMP,
    work_minutes INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'ABSENT',
    is_late BOOLEAN NOT NULL DEFAULT false,
    is_auto_clocked_out BOOLEAN NOT NULL DEFAULT false,
    note VARCHAR(300),
    modified_by VARCHAR(36) REFERENCES users(id),
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT uq_attendance_record UNIQUE (organization_id, member_id, record_date)
);

CREATE INDEX idx_attendance_org_date ON org_attendance_records(organization_id, record_date);
CREATE INDEX idx_attendance_member ON org_attendance_records(member_id, record_date);
