-- API 메트릭 시간별 스냅샷 (7일 보관)
CREATE TABLE api_metric_snapshots (
    id VARCHAR(36) PRIMARY KEY,
    endpoint VARCHAR(255) NOT NULL,
    http_method VARCHAR(10) NOT NULL,
    snapshot_time TIMESTAMP NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    avg_response_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
    max_response_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
    p95_response_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
    p99_response_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    error_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_metric_snapshots_time ON api_metric_snapshots(snapshot_time);
CREATE INDEX idx_api_metric_snapshots_endpoint ON api_metric_snapshots(endpoint, snapshot_time);

-- 모니터링 시스템 설정 (Slack webhook URL 등)
CREATE TABLE monitoring_config (
    id VARCHAR(36) PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value TEXT,
    description VARCHAR(500),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
