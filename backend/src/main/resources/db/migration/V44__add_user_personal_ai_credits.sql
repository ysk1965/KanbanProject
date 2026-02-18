-- User-level personal AI credits (separate from board-level subscription credits)
ALTER TABLE users ADD COLUMN personal_ai_credits INTEGER DEFAULT 30;
ALTER TABLE users ADD COLUMN personal_credits_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN personal_credits_reset_date TIMESTAMP;
