-- Mention Groups (보드별 멘션 그룹)
CREATE TABLE IF NOT EXISTS mention_groups (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36) NOT NULL,
    name VARCHAR(50) NOT NULL,
    created_by VARCHAR(36),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    CONSTRAINT fk_mg_board FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    CONSTRAINT fk_mg_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uk_mg_board_name UNIQUE (board_id, name)
);
CREATE INDEX IF NOT EXISTS idx_mg_board ON mention_groups(board_id);

-- Mention Group Members (멘션 그룹 멤버)
CREATE TABLE IF NOT EXISTS mention_group_members (
    id VARCHAR(36) PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_mgm_group FOREIGN KEY (group_id) REFERENCES mention_groups(id) ON DELETE CASCADE,
    CONSTRAINT fk_mgm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uk_mgm_group_user UNIQUE (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_mgm_group ON mention_group_members(group_id);
