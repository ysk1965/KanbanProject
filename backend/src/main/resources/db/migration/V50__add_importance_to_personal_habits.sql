-- Add importance column to personal_habits table
ALTER TABLE personal_habits ADD COLUMN IF NOT EXISTS importance VARCHAR(10) NOT NULL DEFAULT 'MEDIUM';
