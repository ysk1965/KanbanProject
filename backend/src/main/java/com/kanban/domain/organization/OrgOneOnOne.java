package com.kanban.domain.organization;

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
@Table(name = "org_one_on_ones")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class OrgOneOnOne {

    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_a_id", nullable = false)
    private OrganizationMember memberA;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_b_id", nullable = false)
    private OrganizationMember memberB;

    @Enumerated(EnumType.STRING)
    @Column(name = "recurrence_type", length = 20)
    private OneOnOneRecurrenceType recurrenceType;

    @Column(name = "recurrence_day")
    private Integer recurrenceDay;

    @Column(name = "next_meeting_date")
    private LocalDate nextMeetingDate;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    public OrgOneOnOne(Organization organization, OrganizationMember memberA, OrganizationMember memberB,
                       OneOnOneRecurrenceType recurrenceType, Integer recurrenceDay, LocalDate nextMeetingDate) {
        this.id = UUID.randomUUID().toString();
        this.organization = organization;
        // DB CHECK constraint: member_a_id < member_b_id (알파벳순 정렬)
        if (memberA.getId().compareTo(memberB.getId()) < 0) {
            this.memberA = memberA;
            this.memberB = memberB;
        } else {
            this.memberA = memberB;
            this.memberB = memberA;
        }
        this.recurrenceType = recurrenceType;
        this.recurrenceDay = recurrenceDay;
        this.nextMeetingDate = nextMeetingDate;
    }

    public void updateRecurrence(OneOnOneRecurrenceType recurrenceType, Integer recurrenceDay, LocalDate nextMeetingDate) {
        this.recurrenceType = recurrenceType;
        this.recurrenceDay = recurrenceDay;
        this.nextMeetingDate = nextMeetingDate;
    }

    public void softDelete() {
        this.deletedAt = LocalDateTime.now(ZoneOffset.UTC);
        this.active = false;
    }

    public boolean isDeleted() {
        return this.deletedAt != null;
    }

    public boolean isParticipant(String memberId) {
        return this.memberA.getId().equals(memberId) || this.memberB.getId().equals(memberId);
    }

    public boolean isParticipantByUserId(String userId) {
        return this.memberA.getUser().getId().equals(userId) || this.memberB.getUser().getId().equals(userId);
    }
}
