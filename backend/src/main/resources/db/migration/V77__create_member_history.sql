-- Organization member history: tracks changes to department, position, title, grade, job_group, job_title
CREATE TABLE IF NOT EXISTS organization_member_histories (
    id                   VARCHAR(36)  PRIMARY KEY,
    organization_id      VARCHAR(36)  NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    member_id            VARCHAR(36)  NOT NULL REFERENCES organization_members(id) ON DELETE CASCADE,

    department_id        VARCHAR(36)  REFERENCES organization_departments(id) ON DELETE SET NULL,
    department_name      VARCHAR(200),

    position_id          VARCHAR(36)  REFERENCES organization_positions(id) ON DELETE SET NULL,
    position_name        VARCHAR(100),

    title_id             VARCHAR(36)  REFERENCES organization_titles(id) ON DELETE SET NULL,
    title_name           VARCHAR(100),

    grade_id             VARCHAR(36)  REFERENCES organization_grades(id) ON DELETE SET NULL,
    grade_name           VARCHAR(100),

    job_group_id         VARCHAR(36)  REFERENCES organization_job_groups(id) ON DELETE SET NULL,
    job_group_name       VARCHAR(100),

    job_title            VARCHAR(100),

    effective_start_date DATE         NOT NULL,
    effective_end_date   DATE,

    description          TEXT,

    created_by_id        VARCHAR(36)  REFERENCES organization_members(id) ON DELETE SET NULL,
    source               VARCHAR(20)  NOT NULL DEFAULT 'AUTO',

    created_at           TIMESTAMP    NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at           TIMESTAMP    DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_orghistory_member ON organization_member_histories(member_id, effective_start_date DESC);
CREATE INDEX IF NOT EXISTS idx_orghistory_org ON organization_member_histories(organization_id);
