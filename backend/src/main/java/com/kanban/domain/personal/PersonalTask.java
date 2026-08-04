package com.kanban.domain.personal;

import com.kanban.domain.user.User;
import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "personal_tasks", indexes = {
        @Index(name = "idx_personal_task_user_status", columnList = "user_id, status"),
        @Index(name = "idx_personal_task_user_position", columnList = "user_id, status, position"),
        @Index(name = "idx_personal_task_user_board", columnList = "user_id, board_id, status")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PersonalTask extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private PersonalTaskStatus status = PersonalTaskStatus.TODO;

    @Enumerated(EnumType.STRING)
    @Column(name = "priority", nullable = false, length = 10)
    @Builder.Default
    private PersonalTaskPriority priority = PersonalTaskPriority.MEDIUM;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "category", length = 100)
    private String category;

    @Column(name = "color", length = 20)
    private String color;

    @Column(name = "position", nullable = false)
    @Builder.Default
    private Integer position = 0;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    /**
     * 어느 보드에서 적은 백로그인지. NULL이면 마이스페이스 전역 항목이다.
     * 연관관계로 잡지 않는 이유: 백로그는 보드를 참조만 하고 보드 생명주기에 얽히지 않는다.
     */
    @Column(name = "board_id", length = 36)
    private String boardId;

    @Enumerated(EnumType.STRING)
    @Column(name = "promoted_type", length = 20)
    private PersonalTaskPromotionType promotedType;

    /** 승격으로 만들어진 대상의 id (태스크 id · 체크리스트 항목 id · 스케줄 블록 id) */
    @Column(name = "promoted_ref_id", length = 36)
    private String promotedRefId;

    @Column(name = "promoted_at")
    private LocalDateTime promotedAt;

    @OneToMany(mappedBy = "personalTask", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private Set<PersonalTaskTag> taskTags = new HashSet<>();


    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void update(String title, String description, PersonalTaskPriority priority,
                       LocalDate dueDate, String category, String color) {
        if (title != null) this.title = title;
        if (description != null) this.description = description;
        if (priority != null) this.priority = priority;
        if (dueDate != null) this.dueDate = dueDate;
        if (category != null) this.category = category;
        if (color != null) this.color = color;
    }

    public void updateStatus(PersonalTaskStatus newStatus) {
        this.status = newStatus;
        if (newStatus == PersonalTaskStatus.DONE) {
            this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
        } else {
            this.completedAt = null;
        }
    }

    public void updatePosition(int position) {
        this.position = position;
    }

    /**
     * 승격 기록을 남긴다.
     *
     * <p>TIMEBLOCK은 시간만 잡은 것이므로 항목을 대기 상태로 그대로 둔다.
     * TASK · CHECKLIST_ITEM은 실체가 다른 곳으로 옮겨간 것이라 DONE으로 닫는다.
     * (status enum에 PROMOTED를 추가하지 않는 이유는 마이스페이스 기존 화면이
     *  전부 새 상태를 처리해야 하기 때문 — 승격 여부는 promotedType으로 구분한다)
     */
    public void promote(PersonalTaskPromotionType type, String refId) {
        this.promotedType = type;
        this.promotedRefId = refId;
        this.promotedAt = LocalDateTime.now(ZoneOffset.UTC);
        if (type != PersonalTaskPromotionType.TIMEBLOCK) {
            updateStatus(PersonalTaskStatus.DONE);
        }
    }

    /**
     * 승격을 되돌린다 — 만들어진 태스크·체크리스트 항목·블록은 건드리지 않는다.
     * 승격 자체가 실수인 경우가 드물지 않아 원복 경로를 열어 둔다.
     */
    public void unpromote() {
        this.promotedType = null;
        this.promotedRefId = null;
        this.promotedAt = null;
        if (this.status == PersonalTaskStatus.DONE) {
            updateStatus(PersonalTaskStatus.TODO);
        }
    }
}
