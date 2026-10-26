package com.kanban.domain.talent;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TalentLedgerRepository extends JpaRepository<TalentLedger, String> {

    List<TalentLedger> findByUserIdAndAwardKeyOrderByAwardSeqAsc(String userId, String awardKey);

    /** 한 문서에서 나온 행 전부 (살아 있는 적립 계산용) */
    List<TalentLedger> findByUserIdAndSourceIdOrderByAwardSeqAsc(String userId, String sourceId);

    /** 그 주에 셈해지는 특정 사유의 행 — 주간 상한(살아 있는 키 수) 계산용 */
    List<TalentLedger> findByUserIdAndWeekAndReasonIn(String userId, LocalDate week, Collection<String> reasons);

    /** 연속 기록 계산용 — note 행 전부 */
    List<TalentLedger> findByUserIdAndReason(String userId, String reason);

    @Query("SELECT COALESCE(SUM(l.amount), 0) FROM TalentLedger l "
            + "WHERE l.userId = :userId AND l.reason IN :reasons AND l.createdAt >= :from AND l.createdAt < :to")
    long sumByReasonsBetween(
            @Param("userId") String userId,
            @Param("reasons") Collection<String> reasons,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    @Query("SELECT l FROM TalentLedger l WHERE l.userId = :userId AND l.createdAt < :before "
            + "ORDER BY l.createdAt DESC, l.awardSeq DESC, l.id DESC")
    List<TalentLedger> findPage(
            @Param("userId") String userId, @Param("before") LocalDateTime before, Pageable pageable);

    /** 페이지 경계에서 같은 시각의 행이 갈라지지 않게 그 시각의 행을 한꺼번에 */
    List<TalentLedger> findByUserIdAndCreatedAtOrderByAwardSeqDesc(String userId, LocalDateTime createdAt);

    @Query("SELECT COALESCE(SUM(l.amount), 0) FROM TalentLedger l WHERE l.userId = :userId")
    long sumByUser(@Param("userId") String userId);
}
