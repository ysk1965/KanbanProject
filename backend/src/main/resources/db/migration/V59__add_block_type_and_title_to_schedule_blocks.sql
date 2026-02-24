-- schedule_blocks에 block_type, title, color 컬럼 추가
ALTER TABLE schedule_blocks ADD COLUMN block_type VARCHAR(20);
ALTER TABLE schedule_blocks ADD COLUMN title VARCHAR(100);
ALTER TABLE schedule_blocks ADD COLUMN color VARCHAR(7);

-- 기존 데이터 backfill
UPDATE schedule_blocks SET block_type = 'MEETING' WHERE meeting_id IS NOT NULL;
UPDATE schedule_blocks SET block_type = 'CHECKLIST' WHERE checklist_item_id IS NOT NULL AND block_type IS NULL;
