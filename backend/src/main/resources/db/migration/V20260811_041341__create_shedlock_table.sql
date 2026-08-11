-- ShedLock 분산 락 테이블 (스케줄러 중복 실행 방지)
-- 무중단 배포 겹침 구간/오토스케일로 인스턴스가 2대 이상일 때 @Scheduled 작업을 한 곳에서만 실행.
-- ShedLockConfig에서도 IF NOT EXISTS로 방어 생성하므로 순서 무관하게 멱등.
CREATE TABLE IF NOT EXISTS shedlock (
    name VARCHAR(64) NOT NULL,
    lock_until TIMESTAMP NOT NULL,
    locked_at TIMESTAMP NOT NULL,
    locked_by VARCHAR(255) NOT NULL,
    PRIMARY KEY (name)
);
