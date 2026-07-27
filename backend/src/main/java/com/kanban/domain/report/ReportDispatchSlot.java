package com.kanban.domain.report;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.domain.Persistable;

import java.time.LocalDateTime;

/**
 * 자동 보고서 발송의 "이 슬롯은 내가 맡는다" 표식.
 *
 * <p>스케줄러는 매분 돌고 인스턴스는 여러 대다. 같은 예약 분(UTC)에 두 인스턴스가 동시에
 * 조건을 통과하면 보고서가 두 번 나간다. {@code lock_key}(= 보드·종류·분슬롯)를 PK로 두고
 * <b>원자적 INSERT</b>로 한 번만 선점하게 한다 — Redis 없이도 인스턴스 수와 무관하게 멱등하다.
 *
 * <p>발송에 성공하면 행을 지우지 않고 남겨(중복 방지) 스케줄러가 오래된 행을 주기적으로 청소한다.
 */
@Entity
@Table(
    name = "report_dispatch_locks",
    indexes = @Index(name = "idx_report_dispatch_locks_acquired", columnList = "acquired_at")
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ReportDispatchSlot implements Persistable<String> {

    @Id
    @Column(name = "lock_key", length = 255)
    private String lockKey;

    @Column(name = "acquired_at", nullable = false)
    private LocalDateTime acquiredAt;

    public ReportDispatchSlot(String lockKey, LocalDateTime acquiredAt) {
        this.lockKey = lockKey;
        this.acquiredAt = acquiredAt;
    }

    @Override
    public String getId() {
        return lockKey;
    }

    /**
     * 이 엔티티는 슬롯을 <b>선점(INSERT)하거나 삭제할 때만</b> 쓰인다 — 조회 후 갱신 경로가 없다.
     * 항상 새 행으로 취급해 {@code save()}가 merge(SELECT 후 UPDATE)가 아닌 즉시 INSERT를 치게 하고,
     * 그 INSERT의 PK 충돌이 곧 "다른 인스턴스가 먼저 선점"이라는 원자적 신호가 되게 한다.
     */
    @Override
    public boolean isNew() {
        return true;
    }
}
