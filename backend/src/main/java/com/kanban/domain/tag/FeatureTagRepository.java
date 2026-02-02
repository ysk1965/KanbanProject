package com.kanban.domain.tag;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface FeatureTagRepository extends JpaRepository<FeatureTag, String> {

    @Modifying
    @Query("DELETE FROM FeatureTag ft WHERE ft.feature.id IN (SELECT f.id FROM Feature f WHERE f.board.id = :boardId)")
    void deleteAllByBoardId(@Param("boardId") String boardId);

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

    // Fetch Join으로 N+1 방지
    @Query("SELECT ft FROM FeatureTag ft " +
           "JOIN FETCH ft.feature " +
           "JOIN FETCH ft.tag " +
           "WHERE ft.feature.id IN :featureIds")
    List<FeatureTag> findByFeatureIdInWithFetch(@Param("featureIds") List<String> featureIds);

    @Query("SELECT ft FROM FeatureTag ft " +
           "JOIN FETCH ft.tag " +
           "WHERE ft.feature.id = :featureId")
    List<FeatureTag> findByFeatureIdWithFetch(@Param("featureId") String featureId);
}
