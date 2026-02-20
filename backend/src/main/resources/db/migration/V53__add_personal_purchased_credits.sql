-- Add purchased credits field to users for personal credit purchases
ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_purchased_credits INTEGER DEFAULT 0;

-- Make board_id nullable in ai_credit_purchases for personal (non-board) purchases
ALTER TABLE ai_credit_purchases ALTER COLUMN board_id DROP NOT NULL;
