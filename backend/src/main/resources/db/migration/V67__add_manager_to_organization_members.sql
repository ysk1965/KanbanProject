-- V67__add_manager_to_organization_members.sql
-- Add manager_id (self-referencing FK) for reporting line in org chart

ALTER TABLE organization_members
ADD COLUMN manager_id VARCHAR(36) REFERENCES organization_members(id) ON DELETE SET NULL;

CREATE INDEX idx_org_members_manager ON organization_members(manager_id);
