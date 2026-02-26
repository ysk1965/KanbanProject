-- =============================================
-- V62: Rename leave_balances.year to leave_year
-- 'year' is a reserved keyword in H2 and some SQL dialects
-- =============================================

ALTER TABLE leave_balances RENAME COLUMN year TO leave_year;

-- Recreate index with new column name
DROP INDEX IF EXISTS idx_leavebal_org_year;
CREATE INDEX idx_leavebal_org_year ON leave_balances(organization_id, leave_year);
