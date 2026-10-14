-- Polar 웹훅 멱등성 레코드.
-- Standard Webhooks 의 webhook-id 헤더(재전송에도 동일)를 PK 로 두고, 첫 INSERT 가 "내가 처리한다"는 선점 신호다.
-- PK 충돌 = 이미 수신한 이벤트 → PROCESSED 면 건너뛰고, FAILED(또는 오래 멈춘 PROCESSING) 면 다시 처리한다.
-- 행은 ExpiredTokenCleanupScheduler 가 30일 뒤 지운다.
CREATE TABLE IF NOT EXISTS polar_webhook_events (
    id            VARCHAR(255) PRIMARY KEY,
    event_type    VARCHAR(100),
    status        VARCHAR(20)  NOT NULL,
    attempts      INT          NOT NULL DEFAULT 1,
    received_at   TIMESTAMP    NOT NULL,
    updated_at    TIMESTAMP    NOT NULL,
    error_message VARCHAR(2000)
);

CREATE INDEX IF NOT EXISTS idx_polar_webhook_events_received_at ON polar_webhook_events(received_at);
