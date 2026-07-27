-- AI API 키 관리 감사 로그.
-- system_config.updated_by 는 "마지막 변경자" 1건만 남기 때문에 이력 추적이 불가능하다.
-- 키 교체/검증 시도를 성공·실패 관계없이 전부 append-only 로 남긴다.
-- 주의: 키 원문은 절대 저장하지 않는다. 마스킹된 표기만 남긴다.
CREATE TABLE IF NOT EXISTS ai_key_audit_log (
    id            VARCHAR(36) PRIMARY KEY,
    provider      VARCHAR(20)  NOT NULL,
    action        VARCHAR(20)  NOT NULL,
    actor_user_id VARCHAR(36),
    actor_email   VARCHAR(255),
    masked_key    VARCHAR(64),
    success       BOOLEAN      NOT NULL,
    detail        VARCHAR(500),
    created_at    TIMESTAMP    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_key_audit_log_created_at ON ai_key_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_key_audit_log_provider ON ai_key_audit_log(provider);
