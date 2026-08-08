-- JIRA 이슈 메타(타입/우선순위/컴포넌트)를 연동 원장에 기록한다.
--
-- 두 가지 용도가 겹친다:
--  1) 카드 표면 — 이슈 타입·우선순위를 JIRA 화면 카드에 세운다. Task가 아니라 원장에 두는 이유는
--     이 값들이 JIRA 소유(pull이 항상 이김)라서다. BRIDGE 쪽 편집 대상이 아니다.
--  2) 재동기화 — 우선순위/컴포넌트는 태그로 심는데, "직전에 무엇을 심었는지"를 알아야
--     낡은 태그만 정확히 떼어낼 수 있다. 사람이 직접 붙인 태그는 건드리면 안 되므로
--     이름 추측이 아니라 원장에 적힌 값만 회수 대상으로 삼는다.

DO $$ BEGIN
    ALTER TABLE jira_issue_links ADD COLUMN jira_issue_type VARCHAR(60);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE jira_issue_links ADD COLUMN jira_priority VARCHAR(60);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 컴포넌트는 여러 개라 콤마로 결합해 둔다(조회 대상이 아니라 diff 기준값이라 정규화 이득이 없다).
DO $$ BEGIN
    ALTER TABLE jira_issue_links ADD COLUMN jira_component_names VARCHAR(500);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
