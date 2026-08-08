-- JIRA 담당자 양방향 동기화용 기준선 컬럼.
--
-- 기준선이 없으면 "JIRA에서 담당자가 바뀐 것"과 "BRIDGE에서 사람이 분배한 것"을 구분할 수 없어,
-- 폴링이 돌 때마다 나눠 놓은 담당이 통째로 JIRA 값으로 되돌아간다.
-- 직전 관측값(jira_assignee_account_id)을 남겨 두면 실제로 JIRA가 움직였을 때만 pull이 이긴다.
--
-- 두 컬럼 모두 NULL로 시작한다 — 기존 링크는 "기준선 없음"이므로 다음 동기화가
-- 관측만 하고 지나간다(카드를 건드리지 않는다).

DO $$ BEGIN
    ALTER TABLE jira_issue_links ADD COLUMN jira_assignee_account_id VARCHAR(128);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE jira_issue_links ADD COLUMN assignee_synced_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 이 이슈의 담당자를 대표하는 체크리스트 항목.
--
-- 그전에는 제목 접두사("담당: ")가 소유권 표식을 겸했는데, 사람이 항목 제목을 이슈 제목으로 바꿔
-- 쓰는 순간 동기화가 그 항목을 못 찾고 담당 항목을 하나 더 만들었다(중복 169건이 그렇게 생겼다).
-- 표식을 여기로 옮기면 이름을 바꿔도 소유권이 유지된다. 접두사는 이제 표시 기본값일 뿐이다.
DO $$ BEGIN
    ALTER TABLE jira_issue_links ADD COLUMN jira_assignee_item_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
