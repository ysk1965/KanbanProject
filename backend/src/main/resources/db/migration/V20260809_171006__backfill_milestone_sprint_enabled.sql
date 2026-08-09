-- milestones.sprint_enabled 백필 — "스프린트 0개" 상태 해소
--
-- 배경: V20260713_030914에서 이 컬럼은 DEFAULT TRUE("마일스톤 = 스프린트 자동 소유")로 추가됐다.
-- 그러나 Milestone 엔티티가 @Builder.Default false를 들고 있었고 @DynamicInsert가 없어,
-- Hibernate가 INSERT마다 false를 명시적으로 실었다. 그 결과 DB 기본값은 한 번도 적용되지 않았고
-- 레벨 2·3 보드에서 생성된 마일스톤은 스프린트를 영영 갖지 못했다(도달 불가능해야 할 상태).
--
-- 엔티티 기본값을 true로 되돌리고 프로비저닝 게이트를 제거하는 변경과 함께 나간다.
-- 이 UPDATE는 false로 박힌 기존 행만 되돌린다 — 재실행해도 결과가 같다(멱등).

UPDATE milestones
   SET sprint_enabled = TRUE
 WHERE sprint_enabled = FALSE;
