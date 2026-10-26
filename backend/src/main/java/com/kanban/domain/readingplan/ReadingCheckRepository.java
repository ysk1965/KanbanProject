package com.kanban.domain.readingplan;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReadingCheckRepository extends JpaRepository<ReadingCheck, String> {

    List<ReadingCheck> findByPlanIdAndUserId(String planId, String userId);

    List<ReadingCheck> findByPlanIdInAndUserId(Collection<String> planIds, String userId);

    List<ReadingCheck> findByPlanIdAndDayNoAndUserId(String planId, int dayNo, String userId);

    /** [day_no, user_id, 도장 수] — 길 하나의 날·사람별 집계 */
    @Query("SELECT c.dayNo, c.userId, COUNT(c) FROM ReadingCheck c WHERE c.planId = :planId GROUP BY c.dayNo, c.userId")
    List<Object[]> countByDayAndUser(@Param("planId") String planId);
}
