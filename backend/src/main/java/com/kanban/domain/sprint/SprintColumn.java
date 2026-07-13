package com.kanban.domain.sprint;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.milestone.Milestone;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

/**
 * 스프린트 보드의 동적 컬럼. 마일스톤 단위로 공유되어 Sprint 1→2→3이 같은 컬럼 구성을 쓴다.
 * 앞뒤(START/END)는 고정 앵커, 중간(MIDDLE)은 자유. 카드 위치는 {@code checklist_items.sprint_column_id}.
 */
@Entity
@Table(name = "sprint_columns", indexes = {
    @Index(name = "idx_sprint_columns_milestone", columnList = "milestone_id, position")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SprintColumn extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "milestone_id", nullable = false)
    private Milestone milestone;

    @Column(name = "name", nullable = false, length = 60)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 20)
    @Builder.Default
    private SprintColumnKind kind = SprintColumnKind.MIDDLE;

    @Column(name = "position", nullable = false)
    @Builder.Default
    private Integer position = 0;

    @Column(name = "color", length = 20)
    private String color;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public boolean isStart() {
        return this.kind == SprintColumnKind.START;
    }

    public boolean isMiddle() {
        return this.kind == SprintColumnKind.MIDDLE;
    }

    public boolean isEnd() {
        return this.kind == SprintColumnKind.END;
    }

    /** 앵커(START/END)는 이름변경/삭제/이동 불가 */
    public boolean isAnchor() {
        return this.kind == SprintColumnKind.START || this.kind == SprintColumnKind.END;
    }

    public void rename(String name) {
        if (name != null && !name.isBlank()) {
            this.name = name.trim();
        }
    }

    public void updatePosition(int position) {
        this.position = position;
    }

    public void updateColor(String color) {
        this.color = color;
    }
}
