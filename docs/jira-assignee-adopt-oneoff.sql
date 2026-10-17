\pset pager off
\set bid '7ec963c8-63c3-49e3-bf47-876a7cab95f3'
\set ON_ERROR_STOP on

-- ⚠ 배포(Flyway V20260808_102931) 이후에만 실행할 것.
--
-- 팀이 이미 "이슈 제목으로 이름을 바꿔서" 쓰고 있는 항목을, 그 이슈의 담당자 항목으로 인정한다.
-- 이걸 해 두지 않으면
--   · BRIDGE에서 담당자를 바꿔도 JIRA로 나가지 않고(그 항목이 이슈 담당자를 대표하지 않으므로),
--   · JIRA에서 담당자가 바뀌는 순간 "담당: OOO" 항목이 또 하나 붙는다(중복 재발).
--
-- 대상은 애매하지 않은 것만: 살아있는 체크리스트 항목이 정확히 하나인 카드.
-- (항목이 둘 이상인 카드는 어느 쪽이 담당자인지 알 수 없어 건드리지 않는다)
-- 되돌리려면: UPDATE jira_issue_links SET jira_assignee_item_id = NULL WHERE board_id = ...;

BEGIN;

DO $$
DECLARE
    affected integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'jira_issue_links' AND column_name = 'jira_assignee_item_id') THEN
        RAISE EXCEPTION '마이그레이션이 아직 적용되지 않았다 — 배포 후 실행할 것';
    END IF;

    UPDATE jira_issue_links l
    SET jira_assignee_item_id = sole.id
    FROM (
        SELECT ci.task_id, min(ci.id) AS id
        FROM checklist_items ci
        JOIN tasks t ON t.id = ci.task_id
        WHERE t.board_id = '7ec963c8-63c3-49e3-bf47-876a7cab95f3'
          AND ci.deleted_at IS NULL
        GROUP BY ci.task_id
        HAVING count(*) = 1
    ) sole
    WHERE l.board_id = '7ec963c8-63c3-49e3-bf47-876a7cab95f3'
      AND l.target_type = 'TASK'
      AND l.target_id = sole.task_id
      AND l.jira_assignee_item_id IS NULL;

    GET DIAGNOSTICS affected = ROW_COUNT;
    RAISE NOTICE '담당자 항목 표식 % 건 연결 완료', affected;
END $$;

COMMIT;

\echo '--- 연결 결과 ---'
SELECT count(*) FILTER (WHERE jira_assignee_item_id IS NOT NULL) AS linked,
       count(*) AS total
FROM jira_issue_links WHERE board_id = :'bid' AND target_type = 'TASK';

\echo '--- 연결된 항목의 담당자 분포 (이제 이 사람들이 JIRA로 나간다) ---'
SELECT COALESCE(u.name, '(미배정)') AS assignee, count(*) AS cnt
FROM jira_issue_links l
JOIN checklist_items ci ON ci.id = l.jira_assignee_item_id
LEFT JOIN users u ON u.id = ci.assignee_id
WHERE l.board_id = :'bid' AND ci.deleted_at IS NULL
GROUP BY 1 ORDER BY 2 DESC;
