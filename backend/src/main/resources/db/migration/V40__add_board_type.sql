-- Add board_type column to boards table
ALTER TABLE boards ADD COLUMN board_type VARCHAR(20) NOT NULL DEFAULT 'TEAM';

-- Unique constraint: 1 user can have at most 1 personal board
CREATE UNIQUE INDEX uk_boards_owner_personal
    ON boards (owner_id)
    WHERE board_type = 'PERSONAL';
