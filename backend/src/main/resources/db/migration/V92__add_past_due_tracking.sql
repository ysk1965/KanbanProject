-- V92: 결제 실패(PAST_DUE) 추적을 위한 past_due_since 컬럼 추가
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS past_due_since TIMESTAMP;
ALTER TABLE org_subscriptions ADD COLUMN IF NOT EXISTS past_due_since TIMESTAMP;
