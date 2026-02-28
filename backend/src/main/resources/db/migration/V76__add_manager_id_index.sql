-- Add single-column index on manager_id for direct-reports queries
-- (V73 already created composite idx_orgmember_manager on (organization_id, manager_id),
--  but single-column index is needed for cross-org manager lookups)
CREATE INDEX IF NOT EXISTS idx_orgmember_manager_only ON organization_members(manager_id);
