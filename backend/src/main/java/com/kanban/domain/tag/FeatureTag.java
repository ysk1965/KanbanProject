package com.kanban.domain.tag;

import com.kanban.domain.feature.Feature;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "feature_tags", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"feature_id", "tag_id"})
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class FeatureTag {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "feature_id", nullable = false)
    private Feature feature;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tag_id", nullable = false)
    private Tag tag;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public static FeatureTag create(Feature feature, Tag tag) {
        return FeatureTag.builder()
                .feature(feature)
                .tag(tag)
                .build();
    }
}
