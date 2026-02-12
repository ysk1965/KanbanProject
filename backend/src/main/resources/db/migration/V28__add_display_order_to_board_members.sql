-- Add display_order column to board_members for custom member ordering
ALTER TABLE board_members ADD COLUMN display_order INTEGER;

-- Initialize display_order based on joined_at order for each board
UPDATE board_members bm
SET display_order = sub.rn
FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY board_id ORDER BY joined_at ASC) AS rn
    FROM board_members
) sub
WHERE bm.id = sub.id;
