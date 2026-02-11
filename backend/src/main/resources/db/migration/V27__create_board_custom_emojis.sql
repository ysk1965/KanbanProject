-- 보드별 커스텀 이모지 테이블
CREATE TABLE board_custom_emojis (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36) NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    content_type VARCHAR(50) NOT NULL,
    file_size BIGINT NOT NULL,
    uploaded_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_custom_emoji_board ON board_custom_emojis(board_id);

-- comment_reactions.emoji 컬럼 길이 확장 (custom:{uuid} 형식 저장용)
ALTER TABLE comment_reactions ALTER COLUMN emoji TYPE VARCHAR(50);
