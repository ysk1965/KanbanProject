-- Soft delete support for Feature, Task, ChecklistItem (휴지통/복구 기능)
-- Pattern follows V52__add_deleted_at_to_boards.sql
-- Retention: 30 days, then BoardItemCleanupScheduler permanently deletes.

-- features
DO $$ BEGIN
    ALTER TABLE features ADD COLUMN deleted_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE features ADD COLUMN deleted_by VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- tasks
DO $$ BEGIN
    ALTER TABLE tasks ADD COLUMN deleted_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE tasks ADD COLUMN deleted_by VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- checklist_items
DO $$ BEGIN
    ALTER TABLE checklist_items ADD COLUMN deleted_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE checklist_items ADD COLUMN deleted_by VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Partial indexes for trash listing & cleanup scheduler queries
CREATE INDEX IF NOT EXISTS idx_features_deleted_at
    ON features(board_id, deleted_at)
    WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at
    ON tasks(board_id, deleted_at)
    WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_items_deleted_at
    ON checklist_items(task_id, deleted_at)
    WHERE deleted_at IS NOT NULL;
