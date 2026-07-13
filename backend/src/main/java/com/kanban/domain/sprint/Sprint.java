package com.kanban.domain.sprint;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.milestone.Milestone;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 마일스톤 안의 스프린트. Sprint + In Review + Done 3컬럼을 하나로 묶는 "현재 스프린트" 프레임의 메타.
 * 실제 카드는 별도 테이블이 아니라 {@code checklist_items.sprint_id/sprint_stage}로 표현된다.
 */
@Entity
@Table(name = "sprints", indexes = {
    @Index(name = "idx_sprints_milestone", columnList = "milestone_id")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Sprint extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "milestone_id", nullable = false)
    private Milestone milestone;

    @Column(name = "name", nullable = false, length = 120)
    private String name;

    @Column(name = "sequence_no", nullable = false)
    @Builder.Default
    private Integer sequenceNo = 1;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private SprintStatus status = SprintStatus.ACTIVE;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    /** 종료 시 동결된 완료 카드 수 */
    @Column(name = "completed_count", nullable = false)
    @Builder.Default
    private Integer completedCount = 0;

    /** 종료 시 동결된 전체 카드 수 */
    @Column(name = "total_count", nullable = false)
    @Builder.Default
    private Integer totalCount = 0;

    @Column(name = "archived_at")
    private LocalDateTime archivedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public boolean isActive() {
        return this.status == SprintStatus.ACTIVE;
    }

    public void rename(String name) {
        if (name != null && !name.isBlank()) {
            this.name = name;
        }
    }

    public void updatePeriod(LocalDate startDate, LocalDate endDate) {
        this.startDate = startDate;
        this.endDate = endDate;
    }

    /** 종료 시 완료율 동결 (Phase 2 라이프사이클에서 사용) */
    public void archive(int completedCount, int totalCount, LocalDateTime when) {
        this.status = SprintStatus.ARCHIVED;
        this.completedCount = completedCount;
        this.totalCount = totalCount;
        this.archivedAt = when;
    }

    /** 종료 취소 / 재활성화 */
    public void reactivate() {
        this.status = SprintStatus.ACTIVE;
        this.archivedAt = null;
    }
}
