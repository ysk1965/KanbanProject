package com.kanban.domain.milestone;

import com.kanban.domain.feature.Feature;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MilestoneFeatureRepository extends JpaRepository<MilestoneFeature, String> {

    List<MilestoneFeature> findByMilestoneId(String milestoneId);

    List<MilestoneFeature> findByFeatureId(String featureId);

    @Query("SELECT mf.feature FROM MilestoneFeature mf WHERE mf.milestone.id = :milestoneId")
    List<Feature> findFeaturesByMilestoneId(@Param("milestoneId") String milestoneId);

    /** 진행률 집계용 — 대표(primary) 링크 피처만 조회 */
    @Query("SELECT mf.feature FROM MilestoneFeature mf WHERE mf.milestone.id = :milestoneId AND mf.isPrimary = true")
    List<Feature> findPrimaryFeaturesByMilestoneId(@Param("milestoneId") String milestoneId);

    /** 마일스톤 + isPrimary 동시 조회 (detail 응답 매핑용, feature fetch join) */
    @Query("SELECT mf FROM MilestoneFeature mf JOIN FETCH mf.feature WHERE mf.milestone.id = :milestoneId")
    List<MilestoneFeature> findWithFeatureByMilestoneId(@Param("milestoneId") String milestoneId);

    /** 이미 어딘가에 대표 링크를 가진 피처 ID 집합 (신규 링크 primary 판정용) */
    @Query("SELECT mf.feature.id FROM MilestoneFeature mf WHERE mf.feature.id IN :featureIds AND mf.isPrimary = true")
    List<String> findFeatureIdsHavingPrimary(@Param("featureIds") Collection<String> featureIds);

    /** 특정 피처의 현재 대표 링크 (대표 강등/승격용) */
    Optional<MilestoneFeature> findByFeatureIdAndIsPrimaryTrue(String featureId);

    Optional<MilestoneFeature> findByMilestoneIdAndFeatureId(String milestoneId, String featureId);

    /** 남은 이어짐 링크 중 대표 승격 후보 (마일스톤 시작일 빠른 순) */
    @Query("SELECT mf FROM MilestoneFeature mf JOIN mf.milestone m " +
           "WHERE mf.feature.id = :featureId ORDER BY m.startDate ASC, mf.id ASC")
    List<MilestoneFeature> findByFeatureIdOrderByMilestoneStartDate(@Param("featureId") String featureId);

    @Query("SELECT mf.feature.id FROM MilestoneFeature mf WHERE mf.milestone.id = :milestoneId")
    List<String> findFeatureIdsByMilestoneId(@Param("milestoneId") String milestoneId);

    @Query("SELECT DISTINCT mf.feature.id FROM MilestoneFeature mf WHERE mf.milestone.board.id = :boardId")
    List<String> findAllFeatureIdsByBoardId(@Param("boardId") String boardId);

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
