-- 체크리스트 줄 단위 스프린트 지정(오버라이드) 도입.
--
-- checklist_items.sprint_id 는 옛 모델(항목 단위 담기)의 잔재로 V20260729 이후 매핑되지 않은 채
-- 값만 남아 있었다. 이번부터 이 컬럼을 "태스크와 다른 스프린트로 보낸 줄"의 지정값으로 다시 쓴다.
-- null = 태스크의 스프린트를 따라간다(기본). 옛 값은 태스크 이관 시 이미 tasks.sprint_id 로 흡수됐고
-- 지금 남은 값을 그대로 읽으면 모든 줄이 "지정됨"으로 보이므로 한 번 비운다.
-- FK fk_checklist_sprint 는 ON DELETE SET NULL 로 이미 걸려 있어 스프린트 재분할로 버킷이 사라지면
-- 지정도 자동으로 상속으로 돌아간다.
UPDATE checklist_items SET sprint_id = NULL WHERE sprint_id IS NOT NULL;

-- sprint_column_id 는 옛 모델 전용이라 더 이상 쓰지 않는다 (컬럼은 롤백 대비로 둔다).
CREATE INDEX IF NOT EXISTS idx_checklist_sprint ON checklist_items(sprint_id);
