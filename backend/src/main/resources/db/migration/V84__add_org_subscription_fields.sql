ALTER TABLE organizations ADD COLUMN trial_used BOOLEAN DEFAULT FALSE;

ALTER TABLE subscriptions ADD COLUMN migrated_to_org BOOLEAN DEFAULT FALSE;
ALTER TABLE subscriptions ADD COLUMN migrated_to_org_id VARCHAR(36);
ALTER TABLE subscriptions ADD COLUMN migrated_at TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN billing_paused_for_org BOOLEAN DEFAULT FALSE;
