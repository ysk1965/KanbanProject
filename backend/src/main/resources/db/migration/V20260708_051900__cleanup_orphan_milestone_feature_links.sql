-- 유령(orphan) milestone_features 링크 정리 (멱등)
--
-- 배경: 칸반 마일스톤 필터가 task.milestone_id 기준으로 전환되면서, 태스크가 이미
-- 다른 마일스톤으로 옮겨졌는데도 남아있는 stale 피처-마일스톤 링크가 드러남.
-- (예: 아르카나 피처의 유일 태스크는 5.소프트런칭인데 4.테스트런칭 링크가 잔존)
-- deleteTask/hardDeleteTask에 cleanup을 추가해 향후 발생은 막았으나, 과거에 쌓인
-- 링크는 소급 정리되지 않아 멤버십 기반 마일스톤 관리 보드에 유령 카드로 남는다.
--
-- 삭제 조건(프론트 featureMilestonesMap 파생과 동일 semantics — 안전한 부분집합만):
--   1) 해당 피처가 (미삭제) 태스크 중 마일스톤에 배정된 것을 하나라도 가지고 있고
--      (= featureMilestonesMap이 "태스크 파생"으로 계산되는 피처)
--   2) 그런데 그 피처의 (미삭제) 태스크 중 "이 마일스톤"에 배정된 것은 하나도 없음
-- → 이 링크는 새 모델에서 이미 보이지 않는 유령 링크이므로 제거한다.
--
-- 주의: 태스크가 어느 마일스톤에도 배정돼 있지 않은 피처(순수 멤버십, 폴백 대상)는
--       조건 1을 만족하지 않아 링크가 보존된다(피처가 마일스톤에서 통째로 사라지는 것 방지).
-- tasks에는 @SQLRestriction(deleted_at IS NULL)이 걸려 있으므로 SQL에서도 deleted_at IS NULL로 일치시킨다.

DELETE FROM milestone_features mf
WHERE EXISTS (
        SELECT 1 FROM tasks t
        WHERE t.feature_id = mf.feature_id
          AND t.milestone_id IS NOT NULL
          AND t.deleted_at IS NULL
      )
  AND NOT EXISTS (
        SELECT 1 FROM tasks t2
        WHERE t2.feature_id = mf.feature_id
          AND t2.milestone_id = mf.milestone_id
          AND t2.deleted_at IS NULL
      );
