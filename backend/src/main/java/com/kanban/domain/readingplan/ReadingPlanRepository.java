package com.kanban.domain.readingplan;

import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReadingPlanRepository extends JpaRepository<ReadingPlan, String> {

    List<ReadingPlan> findByGroupIdAndStatus(String groupId, String status);

    List<ReadingPlan> findByGroupIdInAndStatus(Collection<String> groupIds, String status);

    List<ReadingPlan> findByOwnerUserIdAndStatusOrderByCreatedAtAsc(String ownerUserId, String status);

    /** 도장 찍기 직렬화 — 같은 장을 두 번 눌러도 도장이 겹치지 않게. id 순으로 잠가 교착을 피한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM ReadingPlan p WHERE p.id IN :ids ORDER BY p.id")
    List<ReadingPlan> lockAllByIdIn(@Param("ids") Collection<String> ids);
}
