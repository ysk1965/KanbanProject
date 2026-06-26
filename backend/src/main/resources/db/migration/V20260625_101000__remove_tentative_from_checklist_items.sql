-- 기존 tentative 아이템을 실제 아이템으로 전환
UPDATE checklist_items SET is_tentative = false WHERE is_tentative = true;

-- is_tentative 컬럼 제거
ALTER TABLE checklist_items DROP COLUMN IF EXISTS is_tentative;
