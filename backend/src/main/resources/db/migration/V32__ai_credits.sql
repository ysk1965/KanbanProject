-- subscriptions 테이블에 크레딧 필드 추가
ALTER TABLE subscriptions ADD COLUMN monthly_ai_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN monthly_credits_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN purchased_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN credits_reset_date TIMESTAMP;

-- ai_credit_purchases 테이블 생성
CREATE TABLE ai_credit_purchases (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    credit_amount INTEGER NOT NULL,
    unit_price INTEGER NOT NULL DEFAULT 1000,
    total_amount INTEGER NOT NULL,
    payment_key VARCHAR(200),
    order_id VARCHAR(200),
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_acp_board FOREIGN KEY (board_id) REFERENCES boards(id)
);

CREATE INDEX idx_acp_board_id ON ai_credit_purchases(board_id);
CREATE INDEX idx_acp_created_at ON ai_credit_purchases(created_at);

-- ai_usage_logs 테이블에 credit_source 필드 추가
ALTER TABLE ai_usage_logs ADD COLUMN credit_source VARCHAR(20) DEFAULT 'MONTHLY';
ALTER TABLE ai_usage_logs ADD COLUMN credits_used INTEGER DEFAULT 1;
