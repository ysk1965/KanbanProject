package com.kanban.domain.board;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "boards")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Board extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(name = "work_hours_per_day")
    @Builder.Default
    private Integer workHoursPerDay = 8;

    @Column(name = "work_start_time")
    @Builder.Default
    private LocalTime workStartTime = LocalTime.of(9, 0);

    @Column(name = "schedule_display_mode", length = 10)
    @Builder.Default
    private String scheduleDisplayMode = "TIME";

    @Column(name = "break_start_time")
    private LocalTime breakStartTime;

    @Column(name = "break_end_time")
    private LocalTime breakEndTime;

    @Column(name = "selected_milestone_id", length = 36)
    private String selectedMilestoneId;

    @Column(name = "background_gradient")
    private String backgroundGradient;

    @Enumerated(EnumType.STRING)
    @Column(name = "board_type", length = 20)
    @Builder.Default
    private BoardType boardType = BoardType.TEAM;

    @Enumerated(EnumType.STRING)
    @Column(name = "tier", length = 20)
    @Builder.Default
    private BoardTier tier = BoardTier.TRIAL;

    @Column(name = "trial_ends_at")
    private LocalDateTime trialEndsAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.tier == BoardTier.TRIAL && this.trialEndsAt == null) {
            this.trialEndsAt = LocalDateTime.now(ZoneOffset.UTC).plusDays(7);
        }
    }

    public boolean isPersonal() {
        return this.boardType == BoardType.PERSONAL;
    }

    public boolean canInviteMembers() {
        return !isPersonal();
    }

    public void updateInfo(String name, String description) {
        if (name != null) {
            this.name = name;
        }
        if (description != null) {
            this.description = description;
        }
    }

    public void updateBackgroundGradient(String backgroundGradient) {
        this.backgroundGradient = backgroundGradient;
    }

    public boolean isOwner(String userId) {
        return this.owner.getId().equals(userId);
    }

    public void updateScheduleSettings(Integer workHoursPerDay, LocalTime workStartTime,
            String scheduleDisplayMode, LocalTime breakStartTime, LocalTime breakEndTime) {
        if (workHoursPerDay != null) {
            this.workHoursPerDay = workHoursPerDay;
        }
        if (workStartTime != null) {
            this.workStartTime = workStartTime;
        }
        if (scheduleDisplayMode != null) {
            this.scheduleDisplayMode = scheduleDisplayMode;
        }
        this.breakStartTime = breakStartTime;
        this.breakEndTime = breakEndTime;
    }

    public void updateSelectedMilestone(String milestoneId) {
        this.selectedMilestoneId = milestoneId;
    }

    /**
     * Premium 기능을 사용할 수 있는지 확인 (TRIAL 또는 PREMIUM)
     */
    public boolean isPremium() {
        return this.tier == BoardTier.TRIAL || this.tier == BoardTier.PREMIUM;
    }

    /**
     * Standard 보드인지 확인
     */
    public boolean isStandard() {
        return this.tier == BoardTier.STANDARD;
    }

    /**
     * 스케줄 기능(위클리/데일리) 접근 가능 여부
     */
    public boolean canAccessSchedule() {
        return isPremium();
    }

    /**
     * 마일스톤 기능 접근 가능 여부
     */
    public boolean canAccessMilestone() {
        return isPremium();
    }

    /**
     * Task 생성 제한 수 반환
     * @return null (무제한) - 모든 티어에서 Task 무제한 생성 가능
     */
    public Integer getTaskLimit() {
        return null;
    }

    /**
     * 통계 기능 접근 가능 여부
     */
    public boolean canAccessStatistics() {
        return isPremium();
    }

    /**
     * AI 리포트 기능 접근 가능 여부
     */
    public boolean canAccessReport() {
        return isPremium();
    }

    /**
     * 미팅 기능 접근 가능 여부
     */
    public boolean canAccessMeeting() {
        return isPremium();
    }

    /**
     * 노트 기능 접근 가능 여부
     */
    public boolean canAccessNote() {
        return isPremium();
    }

    /**
     * 데일리 체크리스트 접근 가능 여부
     */
    public boolean canAccessDailyChecklist() {
        return isPremium();
    }

    /**
     * Slack 연동 기능 접근 가능 여부
     */
    public boolean canAccessSlack() {
        return isPremium();
    }

    /**
     * Premium으로 업그레이드
     */
    public void upgradeToPremium() {
        this.tier = BoardTier.PREMIUM;
        this.trialEndsAt = null;
    }

    /**
     * Standard로 다운그레이드
     */
    public void downgradeToStandard() {
        this.tier = BoardTier.STANDARD;
        this.trialEndsAt = null;
    }

    /**
     * Trial 만료 여부 확인 및 Standard로 전환
     * @return true if tier was changed
     */
    public boolean checkAndUpdateTierIfTrialExpired() {
        if (this.tier == BoardTier.TRIAL &&
            this.trialEndsAt != null &&
            LocalDateTime.now(ZoneOffset.UTC).isAfter(this.trialEndsAt)) {
            this.tier = BoardTier.STANDARD;
            return true;
        }
        return false;
    }

    /**
     * 보드 소유자 변경 (관리자용)
     */
    public void updateOwner(User newOwner) {
        this.owner = newOwner;
    }

    /**
     * Trial 기간 연장 (관리자용)
     */
    public void extendTrial(LocalDateTime newTrialEndsAt) {
        this.trialEndsAt = newTrialEndsAt;
        if (this.tier != BoardTier.TRIAL) {
            this.tier = BoardTier.TRIAL;
        }
    }

    /**
     * 티어 직접 변경 (관리자용)
     */
    public void updateTier(BoardTier tier) {
        this.tier = tier;
        if (tier != BoardTier.TRIAL) {
            this.trialEndsAt = null;
        }
    }
}
