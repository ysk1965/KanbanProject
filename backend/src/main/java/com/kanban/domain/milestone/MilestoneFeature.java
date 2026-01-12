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
