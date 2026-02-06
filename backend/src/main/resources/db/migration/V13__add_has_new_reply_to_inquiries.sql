-- 문의에 새 답변 알림 여부 컬럼 추가
ALTER TABLE inquiries ADD COLUMN has_new_reply BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_inquiry_user_new_reply ON inquiries(user_id, has_new_reply);
