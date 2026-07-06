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

    // 피처의 "홈(대표) 마일스톤"은 더 이상 저장하지 않는다.
    // 응답 시 피처가 연결된 마일스톤 중 가장 이른 시작일(동률 시 마일스톤 id)을 홈으로 파생한다.

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public static MilestoneFeature create(Milestone milestone, Feature feature) {
        return MilestoneFeature.builder()
                .milestone(milestone)
                .feature(feature)
                .build();
    }
}
