package com.kanban.domain.report;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

public interface ReportDispatchSlotRepository extends JpaRepository<ReportDispatchSlot, String> {

    /** 슬롯 해제 — 없으면 아무 일도 안 한다(예외 없음). */
    @Modifying
    @Query("DELETE FROM ReportDispatchSlot s WHERE s.lockKey = :key")
    int deleteByLockKey(@Param("key") String key);

    /** 오래된 슬롯 청소 — 성공 발송은 행을 남기므로 주기적으로 걷어낸다. */
    @Modifying
    @Query("DELETE FROM ReportDispatchSlot s WHERE s.acquiredAt < :before")
    int deleteAcquiredBefore(@Param("before") LocalDateTime before);
}
