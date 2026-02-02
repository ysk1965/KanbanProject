package com.kanban.domain.milestone;

import com.kanban.domain.feature.Feature;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface MilestoneFeatureRepository extends JpaRepository<MilestoneFeature, String> {

    List<MilestoneFeature> findByMilestoneId(String milestoneId);

    List<MilestoneFeature> findByFeatureId(String featureId);

    @Query("SELECT mf.feature FROM MilestoneFeature mf WHERE mf.milestone.id = :milestoneId")
    List<Feature> findFeaturesByMilestoneId(@Param("milestoneId") String milestoneId);

    @Query("SELECT mf.feature.id FROM MilestoneFeature mf WHERE mf.milestone.id = :milestoneId")
    List<String> findFeatureIdsByMilestoneId(@Param("milestoneId") String milestoneId);

    /**
     * 여러 마일스톤의 features를 한 번에 조회 (N+1 문제 해결)
     */
    @Query("SELECT mf FROM MilestoneFeature mf " +
           "JOIN FETCH mf.feature " +
           "WHERE mf.milestone.id IN :milestoneIds")
    List<MilestoneFeature> findByMilestoneIdsWithFeatures(@Param("milestoneIds") List<String> milestoneIds);

    /**
     * 보드에 속한 모든 마일스톤의 features를 한 번에 조회
     */
    @Query("SELECT mf FROM MilestoneFeature mf " +
           "JOIN FETCH mf.feature f " +
           "JOIN mf.milestone m " +
           "WHERE m.board.id = :boardId")
    List<MilestoneFeature> findByBoardIdWithFeatures(@Param("boardId") String boardId);

    boolean existsByMilestoneIdAndFeatureId(String milestoneId, String featureId);

    void deleteByMilestoneId(String milestoneId);

    void deleteByMilestoneIdAndFeatureId(String milestoneId, String featureId);

    void deleteByFeatureId(String featureId);

    int countByMilestoneId(String milestoneId);

    @Modifying
    @Query("DELETE FROM MilestoneFeature mf WHERE mf.milestone.id IN (SELECT m.id FROM Milestone m WHERE m.board.id = :boardId)")
    void deleteAllByBoardId(@Param("boardId") String boardId);
}
