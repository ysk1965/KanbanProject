-- 부모 트리(PARENT_TREE_CHANGELOG) 삭제 감지용 스냅샷.
-- 매 수집마다 트리의 (id·title) 집합을 저장해 두고, 다음 수집에서 사라진 id를 삭제로 판정한다.

CREATE TABLE IF NOT EXISTS confluence_tree_snapshots (
    id             VARCHAR(36)  PRIMARY KEY,
    board_id       VARCHAR(36)  NOT NULL,
    space_key      VARCHAR(100) NOT NULL,
    parent_page_id VARCHAR(60)  NOT NULL,
    entries        TEXT,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_confluence_tree_snapshot') THEN
        ALTER TABLE confluence_tree_snapshots
            ADD CONSTRAINT uk_confluence_tree_snapshot UNIQUE (board_id, space_key, parent_page_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_confluence_tree_snapshot_board
    ON confluence_tree_snapshots(board_id);
