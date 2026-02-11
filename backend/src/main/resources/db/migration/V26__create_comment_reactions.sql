-- 댓글 이모지 리액션 테이블
CREATE TABLE comment_reactions (
    id VARCHAR(36) PRIMARY KEY,
    comment_id VARCHAR(36) NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_reaction_comment_user_emoji UNIQUE (comment_id, user_id, emoji)
);

CREATE INDEX idx_reaction_comment ON comment_reactions(comment_id);
