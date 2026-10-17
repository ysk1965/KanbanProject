package com.kanban.domain.personal.feature;

import com.kanban.domain.personal.feature.dto.PersonalFeatureDocSummaryRow;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface PersonalFeatureDocRepository extends JpaRepository<PersonalFeatureDoc, String> {

    /** 왼쪽 패널 목록 — content를 읽지 않는다 (문서당 최대 256KB라 목록에서 끌어오면 무겁다). */
    @Query("SELECT new com.kanban.domain.personal.feature.dto.PersonalFeatureDocSummaryRow(" +
            "d.id, d.featureKey, d.title, d.schemaVer, d.createdAt, d.updatedAt) " +
            "FROM PersonalFeatureDoc d " +
            "WHERE d.user.id = :userId AND d.featureKey = :featureKey AND d.deletedAt IS NULL " +
            "ORDER BY d.updatedAt DESC")
    List<PersonalFeatureDocSummaryRow> findSummaries(@Param("userId") String userId,
                                                     @Param("featureKey") String featureKey);

    @Query("SELECT COUNT(d) FROM PersonalFeatureDoc d " +
            "WHERE d.user.id = :userId AND d.featureKey = :featureKey AND d.deletedAt IS NULL")
    long countLive(@Param("userId") String userId, @Param("featureKey") String featureKey);

    @Modifying
    @Query("DELETE FROM PersonalFeatureDoc d WHERE d.deletedAt IS NOT NULL AND d.deletedAt < :cutoff")
    int deleteSoftDeletedBefore(@Param("cutoff") LocalDateTime cutoff);
}
