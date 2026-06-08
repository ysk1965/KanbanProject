-- 플래닝(Planning) 기능 제거: planning_cards 테이블 삭제
-- 생성 마이그레이션:
--   V20260421_021705__create_planning_cards.sql (테이블/인덱스/FK/CHECK)
--   V20260421_080819__add_planning_card_activity_types.sql (activity_log CHECK 값 추가)
--
-- 주의: 위 생성 마이그레이션 파일은 이미 dev/prod에 적용되어 있으므로 삭제하지 않습니다
--       (삭제 시 Flyway validation 실패: applied migration not resolved locally).
--       대신 멱등 DROP 마이그레이션으로 테이블만 제거합니다.
--
-- activity_log의 CHECK 제약(activity_log_action_check, activity_log_target_type_check)은
-- 그대로 둡니다. 과거 PLANNING_CARD_* 활동 로그 레코드를 보존하기 위함이며,
-- 이후 마이그레이션(V20260428_094330)이 동일 값을 포함해 제약을 재정의하고 있습니다.

DROP TABLE IF EXISTS planning_cards CASCADE;
