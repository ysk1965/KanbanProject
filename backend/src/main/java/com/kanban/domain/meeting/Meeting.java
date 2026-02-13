package com.kanban.domain.meeting;

import com.kanban.domain.board.Board;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.DynamicUpdate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "meetings")
@DynamicUpdate
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Meeting {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "meeting_date", nullable = false)
    private LocalDate meetingDate;

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    @Column(name = "memo", columnDefinition = "TEXT")
    private String memo;

    @Column(name = "transcript", columnDefinition = "TEXT")
    private String transcript;

    @Column(name = "ai_suggestions", columnDefinition = "TEXT")
    private String aiSuggestions;

    @Column(name = "color", length = 7)
    @Builder.Default
    private String color = "#8B5CF6";

    @Column(name = "recurrence_rule", length = 20)
    private String recurrenceRule;

    @Column(name = "recurrence_group_id", length = 36)
    private String recurrenceGroupId;

    @Column(name = "recurrence_end_date")
    private LocalDate recurrenceEndDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void update(String title, LocalDate meetingDate, LocalTime startTime, LocalTime endTime, String memo, String color) {
        if (title != null) this.title = title;
        if (meetingDate != null) this.meetingDate = meetingDate;
        this.startTime = startTime;
        this.endTime = endTime;
        if (memo != null) this.memo = memo;
        if (color != null) this.color = color;
    }

    public void updateTranscript(String transcript) {
        this.transcript = transcript;
    }

    public void updateAiSuggestions(String aiSuggestions) {
        this.aiSuggestions = aiSuggestions;
    }

    public boolean isRecurring() {
        return this.recurrenceGroupId != null;
    }
}
