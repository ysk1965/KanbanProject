-- V66__make_notification_board_nullable.sql
-- Allow board_id to be NULL for organization-level notifications (e.g., anniversary)

ALTER TABLE notifications ALTER COLUMN board_id DROP NOT NULL;
