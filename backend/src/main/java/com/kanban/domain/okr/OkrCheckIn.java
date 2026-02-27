package com.kanban.domain.okr;

import com.kanban.domain.organization.OrganizationMember;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "okr_checkins")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class OkrCheckIn {

    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "key_result_id", nullable = false)
    private OkrKeyResult keyResult;

    @Column(name = "previous_value", nullable = false)
    private Double previousValue;

    @Column(name = "new_value", nullable = false)
    private Double newValue;

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String confidence = "ON_TRACK";

    @Column(columnDefinition = "TEXT")
    private String note;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_id", nullable = false)
    private OrganizationMember author;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }
}
