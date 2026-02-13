-- AI API 사용량 추적 테이블
CREATE TABLE ai_usage_logs (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36),
    user_id VARCHAR(36),
    feature_type VARCHAR(20) NOT NULL,
    provider VARCHAR(20) NOT NULL,
    model VARCHAR(50) NOT NULL,
    input_tokens INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    estimated_cost_usd DOUBLE PRECISION DEFAULT 0,
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_ai_usage_logs_created_at ON ai_usage_logs(created_at);
CREATE INDEX idx_ai_usage_logs_board ON ai_usage_logs(board_id, created_at);
