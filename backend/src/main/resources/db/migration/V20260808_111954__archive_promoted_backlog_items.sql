-- 승격된 백로그 항목을 목록에서 닫는다.
--
-- 승격은 "대기 → 승격됨" 두 탭 사이의 이동이었고, 승격된 항목은 링크 칩을 단 카드로
-- 백로그에 계속 남아 있었다. 이제 승격은 이관이다 — 실체가 타임블록·태스크·체크리스트
-- 항목으로 옮겨간 순간 백로그에서는 빠진다.
--
-- 레일 조회가 status <> 'ARCHIVED'로 걸려 있으므로, 이미 승격된 옛 항목들도
-- ARCHIVED로 닫아 새 규칙과 같은 상태로 맞춘다. (DONE으로 두면 마이스페이스의
-- "내가 끝낸 일" 집계에 잡히므로 ARCHIVED다 — 승격은 완료가 아니다)
--
-- 조건 자체가 멱등이다: 이미 ARCHIVED면 대상에서 빠진다.

UPDATE personal_tasks
SET status = 'ARCHIVED'
WHERE promoted_type IS NOT NULL
  AND status <> 'ARCHIVED';
