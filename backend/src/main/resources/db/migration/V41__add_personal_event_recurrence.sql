ALTER TABLE personal_events ADD COLUMN recurrence_rule VARCHAR(20);
ALTER TABLE personal_events ADD COLUMN recurrence_group_id VARCHAR(36);
ALTER TABLE personal_events ADD COLUMN recurrence_end_date DATE;
ALTER TABLE personal_events ADD COLUMN recurrence_days_of_week VARCHAR(20);

CREATE INDEX idx_personal_event_recurrence_group ON personal_events (recurrence_group_id);
