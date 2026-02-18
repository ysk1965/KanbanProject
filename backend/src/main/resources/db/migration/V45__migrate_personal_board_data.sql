-- V45__migrate_personal_board_data.sql
-- Phase 2: 기존 Personal Board 데이터를 신규 PersonalTask/PersonalHabit 테이블로 이전

-- 1) Feature→Task → PersonalTask 변환
-- Board.board_type='PERSONAL'인 보드의 Task를 PersonalTask로 이전
INSERT INTO personal_tasks (id, user_id, title, description, status, priority, due_date, category, position, completed_at, created_at, updated_at)
SELECT
    t.id,
    b.owner_id,
    t.title,
    t.description,
    CASE
        WHEN t.is_completed = true THEN 'DONE'
        WHEN bl.name ILIKE '%progress%' THEN 'IN_PROGRESS'
        ELSE 'TODO'
    END,
    'NONE',
    t.due_date,
    f.title,
    t.position,
    t.completed_at,
    t.created_at,
    t.updated_at
FROM tasks t
JOIN boards b ON t.board_id = b.id
JOIN features f ON t.feature_id = f.id
JOIN blocks bl ON t.block_id = bl.id
WHERE b.board_type = 'PERSONAL'
ON CONFLICT (id) DO NOTHING;

-- 2) ChecklistItem → PersonalTaskChecklist 변환
INSERT INTO personal_task_checklists (id, personal_task_id, title, is_completed, position, created_at)
SELECT ci.id, ci.task_id, ci.title, ci.is_completed, ci.position, ci.created_at
FROM checklist_items ci
JOIN tasks t ON ci.task_id = t.id
JOIN boards b ON t.board_id = b.id
WHERE b.board_type = 'PERSONAL'
ON CONFLICT (id) DO NOTHING;

-- 3) DailyChecklist → PersonalHabit 변환
-- DISTINCT ON (assignee_id, title) 으로 중복 제거
INSERT INTO personal_habits (id, user_id, title, frequency_type, target_count, position, is_active, created_at)
SELECT DISTINCT ON (dc.assignee_id, dc.title)
    gen_random_uuid()::text,
    dc.assignee_id,
    dc.title,
    'DAILY',
    1,
    dc.position,
    true,
    MIN(dc.created_at) OVER (PARTITION BY dc.assignee_id, dc.title)
FROM daily_checklists dc
JOIN boards b ON dc.board_id = b.id
WHERE b.board_type = 'PERSONAL'
  AND dc.assignee_id IS NOT NULL
ORDER BY dc.assignee_id, dc.title, dc.created_at;

-- 4) DailyChecklist 기록 → PersonalHabitLog 변환
INSERT INTO personal_habit_logs (id, habit_id, log_date, completed_count, is_completed, created_at)
SELECT
    gen_random_uuid()::text,
    ph.id,
    dc.assigned_date,
    CASE WHEN ci.is_completed THEN 1 ELSE 0 END,
    COALESCE(ci.is_completed, false),
    dc.created_at
FROM daily_checklists dc
JOIN boards b ON dc.board_id = b.id
LEFT JOIN checklist_items ci ON dc.checklist_item_id = ci.id
JOIN personal_habits ph ON ph.user_id = dc.assignee_id AND ph.title = dc.title
WHERE b.board_type = 'PERSONAL'
  AND dc.assignee_id IS NOT NULL
  AND dc.assigned_date IS NOT NULL
ON CONFLICT (habit_id, log_date) DO NOTHING;
