-- Board Resources: 보드별 공유 링크 관리
CREATE TABLE IF NOT EXISTS board_resources (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36) NOT NULL,
    title VARCHAR(100) NOT NULL,
    url VARCHAR(2000) NOT NULL,
    description VARCHAR(255),
    favicon_url VARCHAR(500),
    display_order INTEGER NOT NULL DEFAULT 0,
    created_by VARCHAR(36),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    CONSTRAINT fk_board_resource_board FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    CONSTRAINT fk_board_resource_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_board_resource_board ON board_resources(board_id);
