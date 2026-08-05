-- 끝난 자동수정 작업을 같은 대상으로 다시 담을 수 있게 한다.
--
-- "이슈당 1회" 가드(existsActiveForIssue)는 CANCELLED 외의 모든 상태를 "이미 처리함"으로 세므로,
-- PR까지 간 이슈는 다시 담을 방법이 없었다. 그렇다고 원본 행을 CANCELLED로 덮으면 그 이슈로
-- 만들어진 PR 주소와 결과가 화면에서 사라진다 — 재실행 이력이 곧 이전 PR을 찾는 유일한 단서다.
--
-- 그래서 상태를 건드리지 않고 "이 시도는 뒤에 담긴 시도로 대체됐다"는 표시만 남긴다.
-- 가드는 이 표시가 없는 행만 센다.
DO $$ BEGIN
    ALTER TABLE jira_autofix_jobs ADD COLUMN superseded_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
