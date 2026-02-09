-- NotificationType에 MEETING_MEMO_SHARED 추가
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('COMMENT_MENTION', 'CHECKLIST_ASSIGNED', 'TASK_COMMENT', 'MEETING_MEMO_SHARED'));

-- NotificationPreference에 회의 알림 필드 추가
ALTER TABLE notification_preferences ADD COLUMN meeting_memo_shared_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE notification_preferences ADD COLUMN slack_meeting_memo_shared_enabled BOOLEAN NOT NULL DEFAULT TRUE;
