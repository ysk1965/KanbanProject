-- Personal Habits (replaces DailyChecklist for personal board)
CREATE TABLE personal_habits (
    id               VARCHAR(36)  PRIMARY KEY,
    user_id          VARCHAR(36)  NOT NULL REFERENCES users(id),
    title            VARCHAR(200) NOT NULL,
    description      TEXT,
    icon             VARCHAR(50),
    color            VARCHAR(20)  DEFAULT '#8B5CF6',
    frequency_type   VARCHAR(20)  NOT NULL DEFAULT 'DAILY',
    frequency_days   VARCHAR(20),
    target_count     INTEGER      NOT NULL DEFAULT 1,
    unit             VARCHAR(50),
    current_streak   INTEGER      NOT NULL DEFAULT 0,
    best_streak      INTEGER      NOT NULL DEFAULT 0,
    position         INTEGER      NOT NULL DEFAULT 0,
    is_active        BOOLEAN      NOT NULL DEFAULT true,
    created_at       TIMESTAMP    NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at       TIMESTAMP,
    CONSTRAINT chk_habit_frequency CHECK (frequency_type IN ('DAILY','WEEKDAY','WEEKEND','CUSTOM'))
);

CREATE INDEX idx_personal_habit_user_active ON personal_habits (user_id, is_active);
CREATE INDEX idx_personal_habit_user_position ON personal_habits (user_id, is_active, position);

-- Personal Habit Logs (daily check-in records)
CREATE TABLE personal_habit_logs (
    id               VARCHAR(36)  PRIMARY KEY,
    habit_id         VARCHAR(36)  NOT NULL REFERENCES personal_habits(id) ON DELETE CASCADE,
    log_date         DATE         NOT NULL,
    completed_count  INTEGER      NOT NULL DEFAULT 0,
    is_completed     BOOLEAN      NOT NULL DEFAULT false,
    note             VARCHAR(200),
    created_at       TIMESTAMP    NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at       TIMESTAMP,
    CONSTRAINT uk_habit_log_date UNIQUE (habit_id, log_date)
);

CREATE INDEX idx_habit_log_date ON personal_habit_logs (habit_id, log_date);
CREATE INDEX idx_habit_log_completed ON personal_habit_logs (habit_id, is_completed, log_date);
