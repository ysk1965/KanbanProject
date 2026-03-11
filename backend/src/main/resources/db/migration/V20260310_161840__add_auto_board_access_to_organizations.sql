-- Auto Board Access toggle for organizations (멱등)
DO $$ BEGIN
    ALTER TABLE organizations ADD COLUMN auto_board_access_enabled BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
