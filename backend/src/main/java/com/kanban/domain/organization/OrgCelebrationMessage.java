package com.kanban.domain.organization;

import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "org_celebration_messages")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OrgCelebrationMessage {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_member_id", nullable = false)
    private OrganizationMember targetMember;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_id", nullable = false)
    private User author;

    @Enumerated(EnumType.STRING)
    @Column(name = "anniversary_type", nullable = false, length = 20)
    private AnniversaryType anniversaryType;

    @Column(name = "anniversary_date", nullable = false)
    private LocalDate anniversaryDate;

    @Column(name = "message", nullable = false, length = 500)
    private String message;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public static OrgCelebrationMessage create(Organization org, OrganizationMember targetMember,
                                                User author, AnniversaryType type,
                                                LocalDate date, String message) {
        return OrgCelebrationMessage.builder()
                .organization(org)
                .targetMember(targetMember)
                .author(author)
                .anniversaryType(type)
                .anniversaryDate(date)
                .message(message)
                .build();
    }

    public void updateMessage(String message) {
        this.message = message;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }
}
