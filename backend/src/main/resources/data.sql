-- 테스트 계정 SystemRole 설정
-- admin@test.com → ADMIN 역할
UPDATE users SET system_role = 'ADMIN' WHERE email = 'admin@test.com' AND system_role != 'ADMIN';
