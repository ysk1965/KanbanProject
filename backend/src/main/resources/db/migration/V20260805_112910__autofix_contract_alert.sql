-- 계약 불일치를 슬랙으로 알린 시각.
--
-- 이 고장은 러너가 **살아 있는 채로** 아무 일도 하지 않는 상태다. 그래서 기존 "러너 무응답"
-- 알림(autofix_runner_offline_alerted_at)에 걸리지 않는다 — seen_at은 20초마다 갱신되고
-- 자가진단도 전부 초록이다. 실제로 2026-08-05에 한 시간 넘게 아무도 몰랐다.
--
-- 무응답 알림의 재무장 규칙(alerted_at < seen_at)을 그대로 쓸 수 없다. 러너가 계속 살아 있어
-- seen_at이 끊임없이 앞서 나가므로 5분마다 같은 알림이 나간다. 대신 **드리프트가 해소될 때**
-- 비운다(계약이 맞는 러너가 붙으면 null로 되돌린다) — 한 사건에 한 번만 울린다.

DO $$ BEGIN
    ALTER TABLE jira_integration_configs ADD COLUMN autofix_contract_alerted_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
