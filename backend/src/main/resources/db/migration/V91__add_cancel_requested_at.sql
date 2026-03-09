-- V91: 취소 예약(Grace Period) 지원을 위한 cancel_requested_at 컬럼 추가
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMP;
ALTER TABLE org_subscriptions ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMP;
