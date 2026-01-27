-- 서버 시작 시 첫 번째 사용자를 ADMIN으로 설정
-- 실제 운영 환경에서는 제거하거나 특정 이메일로 제한 필요

-- 기존 사용자가 있으면 ADMIN으로 업데이트 (테스트용)
-- UPDATE users SET system_role = 'ADMIN' WHERE email = 'your-email@example.com';

-- 빈 스크립트 방지용 더미 쿼리
SELECT 1;
