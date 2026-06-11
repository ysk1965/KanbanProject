-- Note likes table
CREATE TABLE IF NOT EXISTS note_likes (
    id VARCHAR(36) PRIMARY KEY,
    note_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_note_like_note FOREIGN KEY (note_id) REFERENCES notes(id),
    CONSTRAINT fk_note_like_user FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Unique constraint: one like per user per note
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_note_like_note_user') THEN
        ALTER TABLE note_likes ADD CONSTRAINT uk_note_like_note_user UNIQUE (note_id, user_id);
    END IF;
END $$;

-- Index for counting likes by note
CREATE INDEX IF NOT EXISTS idx_note_like_note ON note_likes(note_id);
