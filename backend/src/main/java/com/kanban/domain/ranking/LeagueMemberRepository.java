package com.kanban.domain.ranking;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LeagueMemberRepository extends JpaRepository<LeagueMember, String> {

    Optional<LeagueMember> findByWeekAndUserId(LocalDate week, String userId);

    List<LeagueMember> findByWeekAndTierAndCohortOrderByCreatedAtAsc(LocalDate week, int tier, int cohort);

    long countByWeekAndTierAndCohort(LocalDate week, int tier, int cohort);

    @Query("SELECT MAX(m.cohort) FROM LeagueMember m WHERE m.week = :week AND m.tier = :tier")
    Integer maxCohort(@Param("week") LocalDate week, @Param("tier") int tier);

    /** 마감 대상 반 목록 [tier, cohort] */
    @Query("SELECT DISTINCT m.tier, m.cohort FROM LeagueMember m WHERE m.week = :week")
    List<Object[]> findCohorts(@Param("week") LocalDate week);
}
