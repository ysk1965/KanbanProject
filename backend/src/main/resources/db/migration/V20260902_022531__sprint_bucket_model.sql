-- 스프린트 분할(버킷) 모델 전환.
-- 종료/재활성화 라이프사이클이 사라지면서 status·동결 스냅샷(completed/total)·archived_at이
-- 더 이상 코드에 매핑되지 않는다. 엔티티가 INSERT 시 값을 채우지 않으므로 NOT NULL 컬럼을
-- 남겨두면 신규 스프린트 생성이 실패한다 — 컬럼 자체를 제거한다.
-- 기간(start_date/end_date)이 비어 있는 기존 행은 앱이 보드 조회 시 마일스톤 기간을
-- 균등 분배해 지연 백필한다(SprintService.ensureSprintDates) — 여기서는 건드리지 않는다.

ALTER TABLE sprints DROP COLUMN IF EXISTS status;
ALTER TABLE sprints DROP COLUMN IF EXISTS completed_count;
ALTER TABLE sprints DROP COLUMN IF EXISTS total_count;
ALTER TABLE sprints DROP COLUMN IF EXISTS archived_at;
