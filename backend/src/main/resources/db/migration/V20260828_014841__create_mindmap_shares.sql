-- 마인드맵 외부 공유 설정 (보드당 1행)
CREATE TABLE IF NOT EXISTS mindmap_shares (
    id              VARCHAR(36) PRIMARY KEY,
    board_id        VARCHAR(36) NOT NULL UNIQUE,
    share_code      VARCHAR(12) UNIQUE,
    enabled         BOOLEAN     NOT NULL DEFAULT FALSE,
    show_tasks      BOOLEAN     NOT NULL DEFAULT TRUE,
    show_assignees  BOOLEAN     NOT NULL DEFAULT FALSE,
    show_memos      BOOLEAN     NOT NULL DEFAULT FALSE,
    expires_at      TIMESTAMP,
    created_by      VARCHAR(36),
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mindmap_share_board ON mindmap_shares(board_id);
CREATE INDEX IF NOT EXISTS idx_mindmap_share_code ON mindmap_shares(share_code);
