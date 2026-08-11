package com.kanban.domain.sprint;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SprintFeatureRepository extends JpaRepository<SprintFeature, String> {

    /** 스프린트에 담긴 피쳐 매핑 — Feature fetch (소프트 삭제 피쳐는 @SQLRestriction으로 제외됨) */
    @Query("SELECT sf FROM SprintFeature sf JOIN FETCH sf.feature WHERE sf.sprint.id = :sprintId " +
           "ORDER BY sf.createdAt ASC")
    List<SprintFeature> findBySprintIdWithFeature(@Param("sprintId") String sprintId);

    Optional<SprintFeature> findBySprintIdAndFeatureId(String sprintId, String featureId);

    boolean existsBySprintIdAndFeatureId(String sprintId, String featureId);

    @Modifying
    @Query("DELETE FROM SprintFeature sf WHERE sf.sprint.id = :sprintId AND sf.feature.id = :featureId")
    void deleteBySprintIdAndFeatureId(@Param("sprintId") String sprintId, @Param("featureId") String featureId);

    /** 스프린트 모드 off(스프린트 전체 삭제) 시 매핑도 함께 정리 */
    @Modifying
    @Query("DELETE FROM SprintFeature sf WHERE sf.sprint.id IN " +
           "(SELECT s.id FROM Sprint s WHERE s.milestone.id = :milestoneId)")
    void deleteByMilestoneId(@Param("milestoneId") String milestoneId);
}
