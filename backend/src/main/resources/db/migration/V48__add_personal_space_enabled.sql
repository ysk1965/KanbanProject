-- Add personal_space_enabled column to users table
ALTER TABLE users ADD COLUMN personal_space_enabled BOOLEAN NOT NULL DEFAULT false;
