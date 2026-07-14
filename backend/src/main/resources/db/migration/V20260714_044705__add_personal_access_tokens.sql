-- 개인 액세스 토큰(PAT): 헤드리스 클라이언트(MCP 서버 등)가 사용자를 대신해
-- API를 호출할 때 쓰는 장기 · 폐기 가능 자격증명. 원문은 저장하지 않고 SHA-256 해시만 보관.

CREATE TABLE IF NOT EXISTS personal_access_tokens (
    id           VARCHAR(36) PRIMARY KEY,
    token_hash   VARCHAR(64) NOT NULL,
    token_prefix VARCHAR(16) NOT NULL,
    name         VARCHAR(100) NOT NULL,
    user_id      VARCHAR(36) NOT NULL,
    last_used_at TIMESTAMP,
    expires_at   TIMESTAMP,
    revoked_at   TIMESTAMP,
    created_at   TIMESTAMP NOT NULL
);

-- 조회 키(해시)는 유니크
CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_access_tokens_token_hash
    ON personal_access_tokens (token_hash);

-- 사용자별 목록 조회용
CREATE INDEX IF NOT EXISTS idx_personal_access_tokens_user_id
    ON personal_access_tokens (user_id);

-- FK (멱등)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_personal_access_tokens_user') THEN
        ALTER TABLE personal_access_tokens
            ADD CONSTRAINT fk_personal_access_tokens_user
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
    END IF;
END $$;
