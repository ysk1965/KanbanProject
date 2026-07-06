-- 워크로드 특별 일정 (팀 이벤트 / 개인 부재 / 달력 예외)
CREATE TABLE IF NOT EXISTS board_calendar_events (
    id           VARCHAR(36) PRIMARY KEY,
    board_id     VARCHAR(36) NOT NULL,
    event_type   VARCHAR(20) NOT NULL,
    member_id    VARCHAR(36),
    title        VARCHAR(100),
    start_date   DATE NOT NULL,
    end_date     DATE NOT NULL,
    color        VARCHAR(7),
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    created_by   VARCHAR(36),
    created_at   TIMESTAMP,
    updated_at   TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bce_board_range
    ON board_calendar_events(board_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_bce_board_member
    ON board_calendar_events(board_id, member_id);
