-- Add photo_share_title column to organizations for custom shared gallery title
DO $$ BEGIN
    ALTER TABLE organizations ADD COLUMN photo_share_title VARCHAR(100);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
