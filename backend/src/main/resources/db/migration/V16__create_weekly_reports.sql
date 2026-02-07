CREATE TABLE weekly_reports (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36) NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    generated_by VARCHAR(36) NOT NULL REFERENCES users(id),
    report_type VARCHAR(20) NOT NULL,
    target_user_id VARCHAR(36),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    content TEXT NOT NULL,
    data_snapshot TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE INDEX idx_weekly_reports_board_type ON weekly_reports(board_id, report_type);
CREATE INDEX idx_weekly_reports_board_user ON weekly_reports(board_id, target_user_id);
CREATE INDEX idx_weekly_reports_period ON weekly_reports(board_id, period_start, period_end);
