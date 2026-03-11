-- Add gallery-level upload token to organizations
DO $$ BEGIN
    ALTER TABLE organizations ADD COLUMN photo_upload_token VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE organizations ADD COLUMN photo_upload_token_expires_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_photo_upload_token
    ON organizations(photo_upload_token) WHERE photo_upload_token IS NOT NULL;

-- Make created_by nullable on org_photo_tabs for public album creation
ALTER TABLE org_photo_tabs ALTER COLUMN created_by DROP NOT NULL;
