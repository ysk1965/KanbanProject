-- Add upload link fields to org_photo_tabs
DO $$ BEGIN
    ALTER TABLE org_photo_tabs ADD COLUMN upload_token VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE org_photo_tabs ADD COLUMN is_upload_enabled BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE org_photo_tabs ADD COLUMN upload_token_expires_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Unique index on upload_token
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_photo_tab_upload_token ON org_photo_tabs(upload_token) WHERE upload_token IS NOT NULL;

-- Make uploaded_by nullable (for anonymous uploads)
ALTER TABLE org_photos ALTER COLUMN uploaded_by DROP NOT NULL;
