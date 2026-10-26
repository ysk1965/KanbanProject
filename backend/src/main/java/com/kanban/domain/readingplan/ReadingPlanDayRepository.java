package com.kanban.domain.readingplan;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReadingPlanDayRepository extends JpaRepository<ReadingPlanDay, String> {

    List<ReadingPlanDay> findByPlanIdOrderByDayNoAsc(String planId);

    List<ReadingPlanDay> findByPlanIdInOrderByDayNoAsc(Collection<String> planIds);

    Optional<ReadingPlanDay> findByPlanIdAndDayNo(String planId, int dayNo);
}
