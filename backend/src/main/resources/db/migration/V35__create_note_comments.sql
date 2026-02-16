-- 노트 댓글 테이블
CREATE TABLE note_comments (
    id VARCHAR(36) PRIMARY KEY,
    note_id VARCHAR(36) NOT NULL,
    board_id VARCHAR(36) NOT NULL,
    block_id VARCHAR(100),
    parent_id VARCHAR(36),
    author_id VARCHAR(36),
    content TEXT NOT NULL,
    mentions TEXT,
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by VARCHAR(36),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_note_comment_note FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    CONSTRAINT fk_note_comment_board FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    CONSTRAINT fk_note_comment_parent FOREIGN KEY (parent_id) REFERENCES note_comments(id) ON DELETE CASCADE,
    CONSTRAINT fk_note_comment_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_note_comment_resolved_by FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_note_comment_note_id ON note_comments(note_id);
CREATE INDEX idx_note_comment_board_id ON note_comments(board_id);
CREATE INDEX idx_note_comment_parent_id ON note_comments(parent_id);
CREATE INDEX idx_note_comment_block_id ON note_comments(note_id, block_id);

-- notifications 테이블에 note_id 컬럼 추가
ALTER TABLE notifications ADD COLUMN note_id VARCHAR(36);

-- NotificationType에 NOTE_COMMENT_MENTION 추가
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('COMMENT_MENTION', 'CHECKLIST_ASSIGNED', 'TASK_COMMENT', 'MEETING_MEMO_SHARED', 'NOTE_COMMENT_MENTION'));

-- NotificationPreference에 노트 댓글 알림 필드 추가
ALTER TABLE notification_preferences ADD COLUMN note_comment_mention_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE notification_preferences ADD COLUMN slack_note_comment_mention_enabled BOOLEAN NOT NULL DEFAULT TRUE;
