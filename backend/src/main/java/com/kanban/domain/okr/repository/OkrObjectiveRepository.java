package com.kanban.domain.okr.repository;

import com.kanban.domain.okr.OkrObjective;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface OkrObjectiveRepository extends JpaRepository<OkrObjective, String> {

    @Query("SELECT o FROM OkrObjective o " +
           "LEFT JOIN FETCH o.owner om " +
           "LEFT JOIN FETCH om.user " +
           "LEFT JOIN FETCH o.department " +
           "LEFT JOIN FETCH o.parentObjective " +
           "WHERE o.cycle.id = :cycleId " +
           "ORDER BY o.sortOrder ASC")
    List<OkrObjective> findByCycleIdWithDetails(@Param("cycleId") String cycleId);

    List<OkrObjective> findByCycleIdOrderBySortOrderAsc(String cycleId);

    Optional<OkrObjective> findByIdAndOrganizationId(String id, String organizationId);
}
