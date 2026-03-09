-- V93: Organization 레벨 AI 크레딧 풀 (ORG_MANAGED 보드들이 공유)
ALTER TABLE org_subscriptions ADD COLUMN monthly_ai_credits INT DEFAULT 0;
ALTER TABLE org_subscriptions ADD COLUMN monthly_credits_used INT DEFAULT 0;
ALTER TABLE org_subscriptions ADD COLUMN credits_reset_date TIMESTAMP;
