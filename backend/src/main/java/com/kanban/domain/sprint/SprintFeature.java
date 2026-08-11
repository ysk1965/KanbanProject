package com.kanban.domain.sprint;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.feature.Feature;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

/**
 * 스프린트에 담긴 피쳐. 담기의 단위는 피쳐이며, 담는 순간 그 피쳐의 (같은 마일스톤) 태스크가
 * 일괄로 스프린트에 들어오고 이후 추가되는 태스크도 자동 편입된다.
 *
 * <p>태스크가 0개인 피쳐도 이 매핑만으로 스프린트 보드에 (맨 뒤에) 표시된다.
 */
@Entity
@Table(name = "sprint_features", uniqueConstraints = {
    @UniqueConstraint(name = "ux_sprint_features_sprint_feature", columnNames = {"sprint_id", "feature_id"})
}, indexes = {
    @Index(name = "idx_sprint_features_feature", columnList = "feature_id")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SprintFeature extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sprint_id", nullable = false)
    private Sprint sprint;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "feature_id", nullable = false)
    private Feature feature;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }
}
