-- 문의사항 테이블
CREATE TABLE inquiries (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 문의 첨부파일 테이블
CREATE TABLE inquiry_attachments (
    id VARCHAR(36) PRIMARY KEY,
    inquiry_id VARCHAR(36) NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
    original_file_name VARCHAR(255) NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    url VARCHAR(500) NOT NULL,
    thumbnail_s3_key VARCHAR(500),
    thumbnail_url VARCHAR(500),
    content_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 문의 답변 테이블
CREATE TABLE inquiry_replies (
    id VARCHAR(36) PRIMARY KEY,
    inquiry_id VARCHAR(36) NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
    admin_id VARCHAR(36) NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inquiry_user ON inquiries(user_id);
CREATE INDEX idx_inquiry_status ON inquiries(status);
CREATE INDEX idx_inquiry_attachment ON inquiry_attachments(inquiry_id);
CREATE INDEX idx_inquiry_reply ON inquiry_replies(inquiry_id);
