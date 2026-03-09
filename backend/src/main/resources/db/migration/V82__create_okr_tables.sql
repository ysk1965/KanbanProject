-- V82__create_okr_tables.sql

CREATE TABLE okr_cycles (
    id              VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    name            VARCHAR(100) NOT NULL,
    cycle_type      VARCHAR(20) NOT NULL DEFAULT 'QUARTERLY',
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'PLANNING',
    created_by      VARCHAR(36) NOT NULL REFERENCES users(id),
    created_at      TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at      TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TABLE okr_objectives (
    id                    VARCHAR(36) PRIMARY KEY,
    cycle_id              VARCHAR(36) NOT NULL REFERENCES okr_cycles(id) ON DELETE CASCADE,
    organization_id       VARCHAR(36) NOT NULL REFERENCES organizations(id),
    title                 VARCHAR(500) NOT NULL,
    description           TEXT,
    level                 VARCHAR(20) NOT NULL DEFAULT 'COMPANY',
    department_id         VARCHAR(36) REFERENCES organization_departments(id),
    owner_id              VARCHAR(36) REFERENCES organization_members(id),
    parent_objective_id   VARCHAR(36) REFERENCES okr_objectives(id) ON DELETE SET NULL,
    progress              INTEGER NOT NULL DEFAULT 0,
    confidence            VARCHAR(20) NOT NULL DEFAULT 'ON_TRACK',
    sort_order            INTEGER NOT NULL DEFAULT 0,
    created_at            TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at            TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TABLE okr_key_results (
    id              VARCHAR(36) PRIMARY KEY,
    objective_id    VARCHAR(36) NOT NULL REFERENCES okr_objectives(id) ON DELETE CASCADE,
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    metric_type     VARCHAR(20) NOT NULL DEFAULT 'PERCENTAGE',
    start_value     DOUBLE PRECISION NOT NULL DEFAULT 0,
    target_value    DOUBLE PRECISION NOT NULL DEFAULT 100,
    current_value   DOUBLE PRECISION NOT NULL DEFAULT 0,
    unit            VARCHAR(20),
    owner_id        VARCHAR(36) REFERENCES organization_members(id),
    weight          DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    linked_board_id VARCHAR(36) REFERENCES boards(id),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at      TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TABLE okr_checkins (
    id              VARCHAR(36) PRIMARY KEY,
    key_result_id   VARCHAR(36) NOT NULL REFERENCES okr_key_results(id) ON DELETE CASCADE,
    previous_value  DOUBLE PRECISION NOT NULL,
    new_value       DOUBLE PRECISION NOT NULL,
    confidence      VARCHAR(20) NOT NULL DEFAULT 'ON_TRACK',
    note            TEXT,
    author_id       VARCHAR(36) NOT NULL REFERENCES organization_members(id),
    created_at      TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX idx_okr_cycles_org ON okr_cycles(organization_id);
CREATE INDEX idx_okr_objectives_cycle ON okr_objectives(cycle_id);
CREATE INDEX idx_okr_objectives_parent ON okr_objectives(parent_objective_id);
CREATE INDEX idx_okr_objectives_dept ON okr_objectives(department_id);
CREATE INDEX idx_okr_kr_objective ON okr_key_results(objective_id);
CREATE INDEX idx_okr_checkins_kr ON okr_checkins(key_result_id);
