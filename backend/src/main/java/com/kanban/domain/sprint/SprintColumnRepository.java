package com.kanban.domain.sprint;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SprintColumnRepository extends JpaRepository<SprintColumn, String> {

    List<SprintColumn> findByMilestoneIdOrderByPositionAsc(String milestoneId);

    Optional<SprintColumn> findFirstByMilestoneIdAndKind(String milestoneId, SprintColumnKind kind);

    int countByMilestoneId(String milestoneId);

    @Query("SELECT COALESCE(MAX(c.position), 0) FROM SprintColumn c WHERE c.milestone.id = :milestoneId")
    int findMaxPosition(@Param("milestoneId") String milestoneId);
}
