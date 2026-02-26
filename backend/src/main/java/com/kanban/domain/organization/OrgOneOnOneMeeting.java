package com.kanban.domain.organization;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import com.kanban.domain.user.User;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "org_one_on_one_meetings")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class OrgOneOnOneMeeting {

    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "one_on_one_id", nullable = false)
    private OrgOneOnOne oneOnOne;

    @Column(name = "meeting_date", nullable = false)
    private LocalDate meetingDate;

    @Column(columnDefinition = "TEXT")
    private String agenda;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @OneToMany(mappedBy = "meeting", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("displayOrder ASC")
    private List<OrgOneOnOneActionItem> actionItems = new ArrayList<>();

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    public OrgOneOnOneMeeting(OrgOneOnOne oneOnOne, LocalDate meetingDate, String agenda, String notes, User createdBy) {
        this.id = UUID.randomUUID().toString();
        this.oneOnOne = oneOnOne;
        this.meetingDate = meetingDate;
        this.agenda = agenda;
        this.notes = notes;
        this.createdBy = createdBy;
    }

    public void update(LocalDate meetingDate, String agenda, String notes) {
        this.meetingDate = meetingDate;
        this.agenda = agenda;
        this.notes = notes;
    }

    public void softDelete() {
        this.deletedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public boolean isDeleted() {
        return this.deletedAt != null;
    }
}
