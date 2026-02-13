-- Add recurrence fields to meetings table
ALTER TABLE meetings ADD COLUMN recurrence_rule VARCHAR(20);
ALTER TABLE meetings ADD COLUMN recurrence_group_id VARCHAR(36);
ALTER TABLE meetings ADD COLUMN recurrence_end_date DATE;

-- Index for recurrence group queries
CREATE INDEX idx_meeting_recurrence_group ON meetings(recurrence_group_id);

-- Index for date range queries (calendar view)
CREATE INDEX idx_meeting_board_date_range ON meetings(board_id, meeting_date);
