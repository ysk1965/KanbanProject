ALTER TABLE users ADD COLUMN last_active_at TIMESTAMP;

-- 기존 유저의 last_active_at을 last_login_at으로 초기화
UPDATE users SET last_active_at = last_login_at WHERE last_login_at IS NOT NULL;
