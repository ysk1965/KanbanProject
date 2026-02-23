-- Personal Tasks (flat structure replacing Board→Block→Feature→Task for personal board)
CREATE TABLE personal_tasks (
    id              VARCHAR(36)  PRIMARY KEY,
    user_id         VARCHAR(36)  NOT NULL REFERENCES users(id),
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    status          VARCHAR(20)  NOT NULL DEFAULT 'TODO',
    priority        VARCHAR(10)  NOT NULL DEFAULT 'NONE',
    due_date        DATE,
    category        VARCHAR(100),
    color           VARCHAR(20),
    position        INTEGER      NOT NULL DEFAULT 0,
    completed_at    TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at      TIMESTAMP,
    CONSTRAINT chk_personal_task_status CHECK (status IN ('TODO','IN_PROGRESS','DONE','ARCHIVED')),
    CONSTRAINT chk_personal_task_priority CHECK (priority IN ('NONE','LOW','MEDIUM','HIGH','URGENT'))
);

CREATE INDEX idx_personal_task_user_status ON personal_tasks (user_id, status);
CREATE INDEX idx_personal_task_user_position ON personal_tasks (user_id, status, position);
CREATE INDEX idx_personal_task_user_due ON personal_tasks (user_id, due_date) WHERE due_date IS NOT NULL;

-- Personal Task Checklists (sub-items of a personal task)
CREATE TABLE personal_task_checklists (
    id                VARCHAR(36)  PRIMARY KEY,
    personal_task_id  VARCHAR(36)  NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
    title             VARCHAR(200) NOT NULL,
    is_completed      BOOLEAN      NOT NULL DEFAULT false,
    position          INTEGER      NOT NULL DEFAULT 0,
    created_at        TIMESTAMP    NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX idx_ptc_task ON personal_task_checklists (personal_task_id, position);

-- Personal Tags (user-scoped tags)
CREATE TABLE personal_tags (
    id          VARCHAR(36)  PRIMARY KEY,
    user_id     VARCHAR(36)  NOT NULL REFERENCES users(id),
    name        VARCHAR(50)  NOT NULL,
    color       VARCHAR(20),
    created_at  TIMESTAMP    NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT uk_personal_tag_user_name UNIQUE (user_id, name)
);

-- Personal Task Tags (M:N join table)
CREATE TABLE personal_task_tags (
    id                VARCHAR(36) PRIMARY KEY,
    personal_task_id  VARCHAR(36) NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
    personal_tag_id   VARCHAR(36) NOT NULL REFERENCES personal_tags(id) ON DELETE CASCADE,
    CONSTRAINT uk_personal_task_tag UNIQUE (personal_task_id, personal_tag_id)
);

CREATE INDEX idx_ptt_task ON personal_task_tags (personal_task_id);
CREATE INDEX idx_ptt_tag ON personal_task_tags (personal_tag_id);
