package com.kanban.domain.okr.repository;

import com.kanban.domain.okr.OkrKeyResult;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface OkrKeyResultRepository extends JpaRepository<OkrKeyResult, String> {

    @Query("SELECT kr FROM OkrKeyResult kr " +
           "LEFT JOIN FETCH kr.owner om " +
           "LEFT JOIN FETCH om.user " +
           "WHERE kr.objective.id IN :objectiveIds " +
           "ORDER BY kr.sortOrder ASC")
    List<OkrKeyResult> findByObjectiveIdInWithOwner(@Param("objectiveIds") List<String> objectiveIds);

    List<OkrKeyResult> findByObjectiveIdOrderBySortOrderAsc(String objectiveId);

    @Query("SELECT kr FROM OkrKeyResult kr WHERE kr.objective.id = :objectiveId")
    List<OkrKeyResult> findByObjectiveId(@Param("objectiveId") String objectiveId);
}
