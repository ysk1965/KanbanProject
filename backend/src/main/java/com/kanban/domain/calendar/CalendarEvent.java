package com.kanban.domain.calendar;

import com.kanban.domain.board.Board;
import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Objects;
import java.util.UUID;

/**
 * 워크로드 특별 일정 (팀 이벤트 / 개인 부재 / 달력 예외).
 * 보드에 종속되며, HR 모듈 on/off와 무관하게 모든 보드에서 동작한다.
 */
@Entity
@Table(name = "board_calendar_events", indexes = {
        @Index(name = "idx_bce_board_range", columnList = "board_id, start_date, end_date"),
        @Index(name = "idx_bce_board_member", columnList = "board_id, member_id")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CalendarEvent extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 20)
    private CalendarEventType eventType;

    /** 개인 부재(MEMBER 카테고리)일 때만 값이 존재. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id")
    private User member;

    @Column(name = "title", length = 100)
    private String title;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    /** null이면 프론트가 타입 기본색 사용. */
    @Column(name = "color", length = 7)
    private String color;

    /** 매년 반복 (창립기념일 등 CALENDAR 타입 위주). */
    @Column(name = "is_recurring", nullable = false)
    @Builder.Default
    private Boolean recurring = false;

    /** 이벤트당 1개의 공유 메모 — 누구든 덮어쓰며 가꾼다. */
    @Column(name = "memo", columnDefinition = "TEXT")
    private String memo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "memo_updated_by")
    private User memoUpdatedBy;

    @Column(name = "memo_updated_at")
    private LocalDateTime memoUpdatedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.recurring == null) {
            this.recurring = false;
        }
    }

    public void updateInfo(CalendarEventType eventType, User member, String title,
                           LocalDate startDate, LocalDate endDate, String color, Boolean recurring) {
        if (eventType != null) {
            this.eventType = eventType;
            // 카테고리가 바뀌어 멤버가 불필요해지면 정리
            if (!eventType.requiresMember()) {
                this.member = null;
            }
        }
        if (member != null && this.eventType != null && this.eventType.requiresMember()) {
            this.member = member;
        }
        if (title != null) {
            this.title = title;
        }
        if (startDate != null) {
            this.startDate = startDate;
        }
        if (endDate != null) {
            this.endDate = endDate;
        }
        if (color != null) {
            this.color = color.isBlank() ? null : color;
        }
        if (recurring != null) {
            this.recurring = recurring;
        }
    }

    /** 메모 덮어쓰기 — 내용이 실제로 바뀔 때만 수정 귀속을 갱신한다. 빈 문자열은 비우기(null). */
    public void updateMemo(String content, User editor) {
        String normalized = (content == null || content.isBlank()) ? null : content;
        if (Objects.equals(this.memo, normalized)) {
            return;
        }
        this.memo = normalized;
        this.memoUpdatedBy = normalized != null ? editor : null;
        this.memoUpdatedAt = normalized != null ? LocalDateTime.now(ZoneOffset.UTC) : null;
    }
}
