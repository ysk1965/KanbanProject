CREATE TABLE org_one_on_one_action_items (
    id VARCHAR(36) PRIMARY KEY,
    meeting_id VARCHAR(36) NOT NULL REFERENCES org_one_on_one_meetings(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    assignee_id VARCHAR(36) REFERENCES organization_members(id) ON DELETE SET NULL,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMP,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX idx_one_on_one_org ON org_one_on_ones(organization_id);
CREATE INDEX idx_one_on_one_members ON org_one_on_ones(member_a_id, member_b_id);
CREATE INDEX idx_one_on_one_meetings ON org_one_on_one_meetings(one_on_one_id, meeting_date DESC);
CREATE INDEX idx_one_on_one_actions ON org_one_on_one_action_items(meeting_id);
CREATE INDEX idx_one_on_one_actions_open ON org_one_on_one_action_items(assignee_id) WHERE is_completed = false;
