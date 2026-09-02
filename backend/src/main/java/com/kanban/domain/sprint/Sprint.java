package com.kanban.domain.sprint;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.milestone.Milestone;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.UUID;

/**
 * 마일스톤을 N등분한 스프린트 버킷.
 *
 * <p>닫고 여는 라이프사이클이 없다 — 마일스톤 기간을 나눈 구간이며, 지남/진행중/예정은
 * 오늘 날짜에서 파생된다({@link #stateOn}). 태스크는 어느 버킷에든 담기고 언제든 옮길 수 있다.
 * 나누지 않은 마일스톤은 전체 기간을 덮는 스프린트 1개로 표현된다.
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

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
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

    public void updateSequence(int sequenceNo) {
        this.sequenceNo = sequenceNo;
    }

    /** 오늘 기준 파생 상태. 기간이 비어 있으면 진행중으로 본다(나누기 전 단일 스프린트 보호). */
    public SprintState stateOn(LocalDate today) {
        if (endDate != null && today.isAfter(endDate)) {
            return SprintState.PAST;
        }
        if (startDate != null && today.isBefore(startDate)) {
            return SprintState.FUTURE;
        }
        return SprintState.CURRENT;
    }
}
