package com.kanban.domain.milestone;

import com.kanban.domain.feature.Feature;
import org.springframework.data.jpa.repository.JpaRepository;
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

    boolean existsByMilestoneIdAndFeatureId(String milestoneId, String featureId);

    void deleteByMilestoneId(String milestoneId);

    void deleteByMilestoneIdAndFeatureId(String milestoneId, String featureId);

    void deleteByFeatureId(String featureId);

    int countByMilestoneId(String milestoneId);
}
