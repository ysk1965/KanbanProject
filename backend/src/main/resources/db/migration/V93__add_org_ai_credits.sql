-- V93: Organization 레벨 AI 크레딧 풀 (ORG_MANAGED 보드들이 공유)
ALTER TABLE org_subscriptions ADD COLUMN IF NOT EXISTS monthly_ai_credits INT DEFAULT 0;
ALTER TABLE org_subscriptions ADD COLUMN IF NOT EXISTS monthly_credits_used INT DEFAULT 0;
ALTER TABLE org_subscriptions ADD COLUMN IF NOT EXISTS credits_reset_date TIMESTAMP;
