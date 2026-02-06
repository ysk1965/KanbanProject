-- V9: Allow nullable created_by/author_id columns for user account deletion
-- When a user deletes their account, these references are set to NULL instead of cascading deletes

ALTER TABLE features ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE tasks ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE comments ALTER COLUMN author_id DROP NOT NULL;
ALTER TABLE milestones ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE invite_links ALTER COLUMN created_by DROP NOT NULL;
