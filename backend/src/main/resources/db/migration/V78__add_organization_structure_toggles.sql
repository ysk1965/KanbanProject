-- V78: Add structure section toggle columns to organizations
ALTER TABLE organizations ADD COLUMN departments_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE organizations ADD COLUMN job_groups_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE organizations ADD COLUMN positions_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE organizations ADD COLUMN titles_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE organizations ADD COLUMN grades_enabled BOOLEAN NOT NULL DEFAULT TRUE;
