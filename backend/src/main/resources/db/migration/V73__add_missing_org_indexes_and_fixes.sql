-- =============================================
-- V73: Missing Organization Indexes & Fixes
-- =============================================

-- 1. Missing index on org_one_on_one_meetings.created_by
CREATE INDEX IF NOT EXISTS idx_one_on_one_meetings_created_by
    ON org_one_on_one_meetings(created_by);

-- 2. Missing index for soft-delete queries on org_one_on_one_meetings
CREATE INDEX IF NOT EXISTS idx_one_on_one_meetings_active
    ON org_one_on_one_meetings(one_on_one_id) WHERE deleted_at IS NULL;

-- 3. Missing index on org_one_on_ones.next_meeting_date for scheduling queries
CREATE INDEX IF NOT EXISTS idx_one_on_one_next_meeting
    ON org_one_on_ones(organization_id, next_meeting_date) WHERE deleted_at IS NULL AND is_active = true;

-- 4. Missing index on organization_members.manager_id for org chart queries
CREATE INDEX IF NOT EXISTS idx_orgmember_manager
    ON organization_members(organization_id, manager_id);

-- 5. Fix V63 timezone: update org_announcements default to UTC
-- (Only affects new rows, existing data is fine since app uses UTC)
ALTER TABLE org_announcements
    ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'UTC');
ALTER TABLE org_announcements
    ALTER COLUMN updated_at SET DEFAULT (NOW() AT TIME ZONE 'UTC');

-- 6. Fix V63 timezone: update org_activities default to UTC
ALTER TABLE org_activities
    ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'UTC');

-- 7. Add updated_at to org_one_on_one_action_items for audit tracking
ALTER TABLE org_one_on_one_action_items
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

-- 8. Add updated_at to org_onboarding_template_items for audit tracking
ALTER TABLE org_onboarding_template_items
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;
