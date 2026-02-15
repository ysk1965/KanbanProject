-- Add sharing support to notes
ALTER TABLE notes ADD COLUMN share_token VARCHAR(36) UNIQUE;
ALTER TABLE notes ADD COLUMN is_shared BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_notes_share_token ON notes (share_token) WHERE share_token IS NOT NULL;
