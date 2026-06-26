package com.kanban.domain.milestone;

import com.kanban.domain.feature.Feature;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "milestone_features", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"milestone_id", "feature_id"})
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class MilestoneFeature {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "milestone_id", nullable = false)
    private Milestone milestone;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "feature_id", nullable = false)
    private Feature feature;

    /**
     * 대표(홈) 마일스톤 여부.
     * 피처는 정확히 1개의 대표 링크를 가지며, 진행률은 대표 마일스톤에만 집계된다.
     * false면 "이어짐"(continuation) — 표시는 되지만 진행률 집계 대상이 아님.
     */
    @Column(name = "is_primary", nullable = false)
    @Builder.Default
    private boolean isPrimary = true;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public static MilestoneFeature create(Milestone milestone, Feature feature) {
        return create(milestone, feature, true);
    }

    public static MilestoneFeature create(Milestone milestone, Feature feature, boolean isPrimary) {
        return MilestoneFeature.builder()
                .milestone(milestone)
                .feature(feature)
                .isPrimary(isPrimary)
                .build();
    }

    public void updatePrimary(boolean isPrimary) {
        this.isPrimary = isPrimary;
    }
}
