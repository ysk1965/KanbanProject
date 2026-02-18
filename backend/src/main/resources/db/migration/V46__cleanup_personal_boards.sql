-- V46__cleanup_personal_boards.sql
-- Phase 4: Personal Board 관련 이전 데이터 정리
-- V45 마이그레이션 완료 후 실행

-- 1) DailyChecklist 삭제 (Personal 보드 전용)
DELETE FROM daily_checklists WHERE board_id IN (SELECT id FROM boards WHERE board_type = 'PERSONAL');

-- 2) ScheduleBlock 삭제 (Personal 보드 전용)
DELETE FROM schedule_blocks WHERE board_id IN (SELECT id FROM boards WHERE board_type = 'PERSONAL');

-- 3) ChecklistItem 삭제
DELETE FROM checklist_items WHERE task_id IN (
    SELECT t.id FROM tasks t JOIN boards b ON t.board_id = b.id WHERE b.board_type = 'PERSONAL'
);

-- 4) Task 삭제
DELETE FROM tasks WHERE board_id IN (SELECT id FROM boards WHERE board_type = 'PERSONAL');

-- 5) Feature 삭제
DELETE FROM features WHERE board_id IN (SELECT id FROM boards WHERE board_type = 'PERSONAL');

-- 6) Block 삭제
DELETE FROM blocks WHERE board_id IN (SELECT id FROM boards WHERE board_type = 'PERSONAL');

-- 7) BoardMember 삭제
DELETE FROM board_members WHERE board_id IN (SELECT id FROM boards WHERE board_type = 'PERSONAL');

-- 8) Subscription 삭제
DELETE FROM subscriptions WHERE board_id IN (SELECT id FROM boards WHERE board_type = 'PERSONAL');

-- 9) Board 삭제
DELETE FROM boards WHERE board_type = 'PERSONAL';
