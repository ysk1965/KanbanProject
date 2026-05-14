-- Add start_date and end_date to board_contractors for contract period tracking
DO $$ BEGIN
    ALTER TABLE board_contractors ADD COLUMN start_date DATE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE board_contractors ADD COLUMN end_date DATE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
