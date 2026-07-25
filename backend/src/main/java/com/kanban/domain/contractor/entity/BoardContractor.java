package com.kanban.domain.contractor.entity;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.jobrole.entity.JobRole;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "board_contractors", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"board_id", "name"})
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BoardContractor {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "manager_member_id")
    private BoardMember manager;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "job_role_id")
    private JobRole jobRole;

    @Column(name = "name", nullable = false, length = 50)
    private String name;

    @Column(name = "color", length = 20)
    private String color;

    /** 이 외주의 GitHub 로그인(계정 아이디). 리포트에서 commit.authorLogin 매칭에 사용. nullable. */
    @Column(name = "github_login", length = 100)
    private String githubLogin;

    @Column(name = "display_order")
    private Integer displayOrder;

    /** 워크로드 뷰에서 숨김 여부 (더이상 진행하지 않는 외주 숨기기). 데이터는 보존. */
    @Column(name = "hidden", nullable = false)
    @Builder.Default
    private Boolean hidden = false;

    /**
     * 계약 기간 목록 (다중 기간 이력). start_date ASC 정렬.
     * 외주 삭제 시 기간도 함께 삭제(cascade + orphanRemoval), DB 레벨 ON DELETE CASCADE 와 이중 안전장치.
     */
    @OneToMany(mappedBy = "contractor", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("startDate ASC")
    @Builder.Default
    private List<BoardContractorPeriod> periods = new ArrayList<>();

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

    public void updateInfo(String name, String color) {
        if (name != null) this.name = name;
        if (color != null) this.color = color;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void updateGithubLogin(String githubLogin) {
        this.githubLogin = githubLogin;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void updateManager(BoardMember manager) {
        this.manager = manager;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void updateJobRole(JobRole jobRole) {
        this.jobRole = jobRole;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void updateDisplayOrder(Integer displayOrder) {
        this.displayOrder = displayOrder;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void updateHidden(boolean hidden) {
        this.hidden = hidden;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void touch() {
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void addPeriod(BoardContractorPeriod period) {
        period.assignContractor(this);
        this.periods.add(period);
        touch();
    }

    public void removePeriod(BoardContractorPeriod period) {
        this.periods.remove(period);
        touch();
    }

    // ─── 파생 상태 계산 (저장하지 않음, 오늘 기준) ───

    /** 오늘이 기간 안인지 (null start = 시작 무제한, null end = 종료 무제한). */
    private static boolean covers(BoardContractorPeriod p, LocalDate today) {
        boolean afterStart = p.getStartDate() == null || !today.isBefore(p.getStartDate());
        boolean beforeEnd = p.getEndDate() == null || !today.isAfter(p.getEndDate());
        return afterStart && beforeEnd;
    }

    private static boolean isUpcoming(BoardContractorPeriod p, LocalDate today) {
        return p.getStartDate() != null && today.isBefore(p.getStartDate());
    }

    /**
     * 표시용 대표 기간: 오늘 포함 기간 → 없으면 가장 가까운 예정 → 없으면 가장 최근 과거.
     */
    public BoardContractorPeriod getCurrentPeriod() {
        if (periods == null || periods.isEmpty()) return null;
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        BoardContractorPeriod active = null;
        BoardContractorPeriod nextUpcoming = null;
        BoardContractorPeriod lastPast = null;
        for (BoardContractorPeriod p : periods) {
            if (covers(p, today)) {
                if (active == null) active = p;
            } else if (isUpcoming(p, today)) {
                if (nextUpcoming == null
                        || p.getStartDate().isBefore(nextUpcoming.getStartDate())) {
                    nextUpcoming = p;
                }
            } else {
                // 과거(종료됨). 종료일이 가장 늦은 것을 대표로.
                if (lastPast == null
                        || (p.getEndDate() != null && lastPast.getEndDate() != null
                            && p.getEndDate().isAfter(lastPast.getEndDate()))) {
                    lastPast = p;
                }
            }
        }
        if (active != null) return active;
        if (nextUpcoming != null) return nextUpcoming;
        return lastPast;
    }

    /** active(활동중) / upcoming(예정) / expired(만료) / none(기간 없음). */
    public String getDerivedStatus() {
        if (periods == null || periods.isEmpty()) return "none";
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        boolean hasUpcoming = false;
        boolean hasPast = false;
        for (BoardContractorPeriod p : periods) {
            if (covers(p, today)) return "active";
            if (isUpcoming(p, today)) hasUpcoming = true;
            else hasPast = true;
        }
        if (hasUpcoming) return "upcoming";
        if (hasPast) return "expired";
        return "none";
    }
}
