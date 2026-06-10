package com.kanban.domain.contractor.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * 외주(BoardContractor) 의 계약 기간 한 건.
 * 외주 1명이 여러 기간(과거 계약 + 신규 계약)을 누적 보유할 수 있다.
 * 상태(활동중/예정/만료)는 저장하지 않고 기간 목록 vs 오늘로 파생 계산한다.
 */
@Entity
@Table(name = "board_contractor_periods")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BoardContractorPeriod {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "contractor_id", nullable = false)
    private BoardContractor contractor;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

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

    public void updatePeriod(LocalDate startDate, LocalDate endDate) {
        this.startDate = startDate;
        this.endDate = endDate;
    }

    void assignContractor(BoardContractor contractor) {
        this.contractor = contractor;
    }
}
