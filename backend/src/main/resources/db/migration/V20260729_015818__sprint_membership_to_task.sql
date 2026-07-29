-- 스프린트 멤버십을 체크리스트 항목 → 태스크 단위로 이관
--
-- 배경: 지금까지 스프린트에 담기는 단위는 checklist_items 였다. 항목 수가 수백 개로 불어나면서
--       담기/이월 조작량이 감당이 안 되고, 스프린트 진행 중 추가된 체크리스트가 자동으로 편입되지
--       않는 문제가 있었다. 담기 단위를 tasks 로 올리면 체크리스트는 태스크에 딸린 내용물이 되어
--       나중에 추가돼도 같은 스프린트 안에서 자연스럽게 함께 굴러간다.
--
-- 백필 규칙:
--   · 담긴 체크리스트가 하나라도 있는 태스크를 그 스프린트에 편입한다(무손실).
--   · 컬럼은 항목들이 놓인 컬럼 중 position 이 가장 작은 것 = 가장 덜 진행된 상태로 보수적으로 잡는다.
--     (전부 Done 이었다면 자연히 END 컬럼이 된다)
--
-- 롤백 대비: checklist_items.sprint_id / sprint_column_id 는 지우지 않고 그대로 둔다.
--            엔티티 매핑에서만 제거되므로 읽히지 않을 뿐, 되돌릴 때 원본 그대로 살아 있다.
-- 멱등 작성 (IF NOT EXISTS / DO $$ 가드). local(H2)은 Flyway off + ddl-auto 라 무영향.

-- 1) tasks 스프린트 멤버십 컬럼
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_id        VARCHAR(36);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_column_id VARCHAR(36);
-- 스프린트 종료 시 다음 스프린트로 넘어간 횟수. "3스프린트째 밀린 태스크" 집계용.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS carry_over_count INT NOT NULL DEFAULT 0;
-- END(Done) 컬럼에 도달한 시각. 칸반 블록 완료(completed_at)와 별개로 스프린트 상의 완료 시점.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_done_at TIMESTAMP;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_sprint') THEN
        ALTER TABLE tasks ADD CONSTRAINT fk_tasks_sprint
            FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_sprint_column') THEN
        ALTER TABLE tasks ADD CONSTRAINT fk_tasks_sprint_column
            FOREIGN KEY (sprint_column_id) REFERENCES sprint_columns(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sprint_column ON tasks(sprint_column_id);

-- 2) 백필 — 담긴 항목이 있는 태스크를 해당 스프린트로 편입
--    한 태스크의 항목이 여러 스프린트에 흩어져 있는 경우는 가장 최근(sequence_no 최대) 스프린트를 택한다.
WITH task_sprint AS (
    SELECT DISTINCT ON (c.task_id)
           c.task_id,
           c.sprint_id
      FROM checklist_items c
      JOIN sprints s ON s.id = c.sprint_id
     WHERE c.sprint_id IS NOT NULL
       AND c.deleted_at IS NULL
     ORDER BY c.task_id, s.sequence_no DESC
),
task_column AS (
    SELECT ts.task_id,
           ts.sprint_id,
           (SELECT c2.sprint_column_id
              FROM checklist_items c2
              JOIN sprint_columns sc ON sc.id = c2.sprint_column_id
             WHERE c2.task_id = ts.task_id
               AND c2.sprint_id = ts.sprint_id
               AND c2.deleted_at IS NULL
             ORDER BY sc.position ASC
             LIMIT 1) AS sprint_column_id
      FROM task_sprint ts
)
UPDATE tasks t
   SET sprint_id        = tc.sprint_id,
       sprint_column_id = tc.sprint_column_id
  FROM task_column tc
 WHERE t.id = tc.task_id
   AND t.deleted_at IS NULL
   AND t.sprint_id IS NULL;

-- 2-1) 이미 END(Done) 컬럼에 백필된 태스크는 스프린트 완료 시각을 채워 둔다.
--      정확한 시각은 남아 있지 않으므로 체크리스트 완료 시각 중 가장 늦은 것으로 근사한다.
UPDATE tasks t
   SET sprint_done_at = COALESCE(
        (SELECT MAX(c.completed_at)
           FROM checklist_items c
          WHERE c.task_id = t.id AND c.deleted_at IS NULL),
        t.completed_at)
  FROM sprint_columns sc
 WHERE sc.id = t.sprint_column_id
   AND sc.kind = 'END'
   AND t.sprint_done_at IS NULL
   AND t.deleted_at IS NULL;

-- 3) 방어 — 컬럼을 못 찾은 편입 태스크는 해당 마일스톤의 START 컬럼으로 보낸다.
UPDATE tasks t
   SET sprint_column_id = (
        SELECT sc.id
          FROM sprint_columns sc
          JOIN sprints s ON s.milestone_id = sc.milestone_id
         WHERE s.id = t.sprint_id
           AND sc.kind = 'START'
         ORDER BY sc.position ASC
         LIMIT 1)
 WHERE t.sprint_id IS NOT NULL
   AND t.sprint_column_id IS NULL
   AND t.deleted_at IS NULL;
