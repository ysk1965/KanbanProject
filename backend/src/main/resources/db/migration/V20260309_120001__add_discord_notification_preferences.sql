-- Add Discord notification preference columns to notification_preferences (idempotent)

DO $$ BEGIN
    ALTER TABLE notification_preferences ADD COLUMN discord_comment_mention_enabled BOOLEAN NOT NULL DEFAULT TRUE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE notification_preferences ADD COLUMN discord_checklist_assigned_enabled BOOLEAN NOT NULL DEFAULT TRUE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE notification_preferences ADD COLUMN discord_task_comment_enabled BOOLEAN NOT NULL DEFAULT TRUE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE notification_preferences ADD COLUMN discord_meeting_memo_shared_enabled BOOLEAN NOT NULL DEFAULT TRUE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE notification_preferences ADD COLUMN discord_note_comment_mention_enabled BOOLEAN NOT NULL DEFAULT TRUE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
