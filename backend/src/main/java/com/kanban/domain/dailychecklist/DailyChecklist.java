package com.kanban.domain.dailychecklist;

import com.kanban.domain.board.Board;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "daily_checklists",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_daily_checklist_board_item_date",
        columnNames = {"board_id", "checklist_item_id", "assigned_date"}
    )
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DailyChecklist {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "checklist_item_id")
    private ChecklistItem checklistItem;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignee_id", nullable = false)
    private User assignee;

    @Column(name = "assigned_date", nullable = false)
    private LocalDate assignedDate;

    /**
     * 행의 성격 (PIN: 오늘로 당겨옴 / EXCLUDE: 오늘에서 뺌).
     * 파생 규칙만으로 표현할 수 없는 예외만 이 테이블에 남는다.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 16)
    @Builder.Default
    private DailyChecklistKind kind = DailyChecklistKind.PIN;

    @Column(name = "position", nullable = false)
    @Builder.Default
    private Integer position = 0;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

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

    public void updatePosition(Integer position) {
        this.position = position;
    }

    public void changeKind(DailyChecklistKind kind) {
        this.kind = kind;
    }

    public boolean isPin() {
        return this.kind == DailyChecklistKind.PIN;
    }

    public boolean isExclude() {
        return this.kind == DailyChecklistKind.EXCLUDE;
    }

    /**
     * 원본 체크리스트가 삭제될 때 연결 해제
     * title은 이미 백업되어 있으므로 checklistItem만 null로 설정
     */
    public void unlinkChecklistItem() {
        this.checklistItem = null;
    }
}
