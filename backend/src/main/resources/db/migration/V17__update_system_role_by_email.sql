-- cookapps.com 이메일은 TESTER, 나머지는 USER로 설정
UPDATE users SET system_role = 'USER' WHERE email NOT LIKE '%@cookapps.com';
UPDATE users SET system_role = 'TESTER' WHERE email LIKE '%@cookapps.com';
