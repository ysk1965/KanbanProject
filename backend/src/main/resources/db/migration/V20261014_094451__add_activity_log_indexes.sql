-- activity_log 조회 인덱스.
-- 보드 활동 피드(board_id + created_at DESC 커서), 대상별 이력(board_id + target_type + target_id),
-- 보관 기간 정리(ActivityLogCleanupScheduler: created_at < cutoff) 세 경로가 전부 풀스캔이었다.
-- CONCURRENTLY 는 Flyway 트랜잭션 안에서 실행할 수 없어 일반 CREATE INDEX 를 쓴다(테이블 규모상 수 초 내).
-- 이름은 ActivityLog 엔티티 @Table(indexes) 와 동일하게 맞춰 ddl-auto: update 가 중복 생성하지 않게 한다.

CREATE INDEX IF NOT EXISTS idx_activity_log_board_created
    ON activity_log (board_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_board_target
    ON activity_log (board_id, target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at
    ON activity_log (created_at);
