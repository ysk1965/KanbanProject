-- 러너가 밝힌 작업 명세 계약 버전.
--
-- 서버만 배포되고 맥의 러너 스크립트가 낡은 채 남으면 두 쪽이 다른 계약을 말한다. JSON은 없는 키를
-- 빈 값으로 주기 때문에 그 어긋남이 오류가 아니라 "매 건 실패"로 나타나고, 실패 한 건은 90분 동안
-- 큐 전체를 막는다. 러너가 보낸 버전을 남겨 두어야 도크가 "러너 스크립트가 낡았다"를 말할 수 있다.
--
-- nullable이다 — 이 필드를 보내지 않는 구버전 러너가 붙어 있을 수 있고, null 자체가 정보다.

DO $$ BEGIN
    ALTER TABLE jira_integration_configs ADD COLUMN autofix_runner_contract INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
