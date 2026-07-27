-- 자동 보고서 발송 중복을 막는 DB 슬롯 클레임 테이블.
-- lock_key = "report:dispatch:{type}:{boardId}:{분슬롯UTC}" 를 PK로 두고, 스케줄러가
-- 원자적 INSERT로 선점한다. PK 충돌 = 다른 인스턴스가 같은 분에 먼저 선점 → 발송 스킵.
-- Redis 분산 락을 대체하며(Redis가 꺼진 dev 환경에서도 동작), 성공 발송은 행을 남겨
-- 중복을 막고 오래된 행은 스케줄러가 주기적으로 청소한다.
CREATE TABLE IF NOT EXISTS report_dispatch_locks (
    lock_key    VARCHAR(255) PRIMARY KEY,
    acquired_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_dispatch_locks_acquired
    ON report_dispatch_locks(acquired_at);
