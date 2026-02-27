-- 멤버별 타임존 컬럼 추가
ALTER TABLE organization_members
ADD COLUMN timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Seoul';

-- 기념일 설정 테이블
CREATE TABLE org_anniversary_settings (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL UNIQUE REFERENCES organizations(id),
    birthday_enabled BOOLEAN NOT NULL DEFAULT true,
    hire_anniversary_enabled BOOLEAN NOT NULL DEFAULT true,
    notify_timing VARCHAR(20) NOT NULL DEFAULT 'DAY_BEFORE',
    dashboard_range VARCHAR(20) NOT NULL DEFAULT 'THIS_MONTH',
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

-- 축하 메시지 테이블
CREATE TABLE org_celebration_messages (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    target_member_id VARCHAR(36) NOT NULL REFERENCES organization_members(id),
    author_id VARCHAR(36) NOT NULL REFERENCES users(id),
    anniversary_type VARCHAR(20) NOT NULL,
    anniversary_date DATE NOT NULL,
    message VARCHAR(500) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX idx_celebration_org_date ON org_celebration_messages(organization_id, anniversary_date);
CREATE INDEX idx_celebration_target ON org_celebration_messages(target_member_id, anniversary_date);
CREATE UNIQUE INDEX uq_celebration_author ON org_celebration_messages(target_member_id, author_id, anniversary_type, anniversary_date);
