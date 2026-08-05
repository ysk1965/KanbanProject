-- 러너 사망 알림의 중복 방지 표식.
--
-- 러너가 죽어도 지금은 아무도 알려주지 않는다 — autofix_runner_seen_at 을 읽는 곳이 화면 조회
-- 하나뿐이라, 도크를 열어본 사람만 안다. 스케줄러가 슬랙으로 알리게 하려면 "이번 오프라인
-- 구간에 대해 이미 알렸는가"를 기억해야 한다. 그 표식이 이 컬럼이다.
--
-- 구간 판정은 seen_at 과의 대소로 한다: alerted_at < seen_at 이면 러너가 그 뒤로 한 번
-- 살아 돌아왔다는 뜻이므로, 다시 죽으면 새 구간으로 보고 한 번 더 알린다.
-- 별도의 "복구됨" 플래그를 두지 않는 이유이기도 하다.

DO $$ BEGIN
    ALTER TABLE jira_integration_configs ADD COLUMN autofix_runner_offline_alerted_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
