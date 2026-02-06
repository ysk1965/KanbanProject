-- Allow users to reply to their own inquiries
ALTER TABLE inquiry_replies ALTER COLUMN admin_id DROP NOT NULL;
ALTER TABLE inquiry_replies ADD COLUMN user_id VARCHAR(36);
ALTER TABLE inquiry_replies ADD COLUMN reply_type VARCHAR(10) NOT NULL DEFAULT 'ADMIN';

-- Set existing replies as ADMIN type
UPDATE inquiry_replies SET reply_type = 'ADMIN' WHERE reply_type IS NULL OR reply_type = '';

-- Add foreign key for user_id
ALTER TABLE inquiry_replies ADD CONSTRAINT fk_inquiry_reply_user FOREIGN KEY (user_id) REFERENCES users(id);

-- Add index for user replies
CREATE INDEX idx_inquiry_reply_user ON inquiry_replies(user_id);
