package com.kanban.domain.tag;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface FeatureTagRepository extends JpaRepository<FeatureTag, String> {

    List<FeatureTag> findByFeatureId(String featureId);

    @Query("SELECT ft.tag FROM FeatureTag ft WHERE ft.feature.id = :featureId")
    List<Tag> findTagsByFeatureId(@Param("featureId") String featureId);

    boolean existsByFeatureIdAndTagId(String featureId, String tagId);

    @Modifying
    void deleteByFeatureIdAndTagId(String featureId, String tagId);

    @Modifying
    void deleteByFeatureId(String featureId);

    @Modifying
    void deleteByTagId(String tagId);

    List<FeatureTag> findByFeatureIdIn(List<String> featureIds);
}
