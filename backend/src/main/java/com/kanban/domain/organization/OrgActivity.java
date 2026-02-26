package com.kanban.domain.organization;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "org_activities")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OrgActivity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @Column(name = "actor_name", nullable = false, length = 100)
    private String actorName;

    @Enumerated(EnumType.STRING)
    @Column(name = "activity_type", nullable = false, length = 50)
    private OrgActivityType activityType;

    @Column(name = "target_name", length = 200)
    private String targetName;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metadata", columnDefinition = "json")
    private Map<String, Object> metadata;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public static OrgActivity create(Organization org, String actorName,
                                      OrgActivityType type, String targetName,
                                      Map<String, Object> metadata) {
        return OrgActivity.builder()
                .organization(org)
                .actorName(actorName)
                .activityType(type)
                .targetName(targetName)
                .metadata(metadata)
                .build();
    }
}
