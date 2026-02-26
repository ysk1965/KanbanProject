-- Add index on organization_members.manager_id for efficient direct-reports queries
CREATE INDEX IF NOT EXISTS idx_orgmember_manager ON organization_members(manager_id);
