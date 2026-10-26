package com.kanban.domain.user;

import com.kanban.domain.board.event.BoardAccessEntityListener;
import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import lombok.*;

@Entity
@Table(name = "users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
@EntityListeners(BoardAccessEntityListener.class)
public class User extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "email", nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "profile_image", length = 500)
    private String profileImage;

    @Column(name = "auth_provider", length = 20)
    @Builder.Default
    private String authProvider = "email";

    @Column(name = "auth_provider_id")
    private String authProviderId;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    @Column(name = "last_active_at")
    private LocalDateTime lastActiveAt;

    @Column(name = "email_verified", nullable = false)
    @Builder.Default
    private Boolean emailVerified = false;

    @Column(name = "email_verified_at")
    private LocalDateTime emailVerifiedAt;

    @Column(name = "theme", length = 20)
    @Builder.Default
    private String theme = "dark";

    @Enumerated(EnumType.STRING)
    @Column(name = "system_role", length = 20)
    @Builder.Default
    private SystemRole systemRole = SystemRole.USER;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private Boolean isActive = true;

    @Column(name = "deactivated_at")
    private LocalDateTime deactivatedAt;

    /** 로드 시점의 systemRole 스냅샷 — BoardAccessEntityListener 가 "실제로 바뀐 업데이트"만 골라내는 데 쓴다. */
    @Transient
    private SystemRole loadedSystemRole;

    /** @PostLoad 는 엔티티당 하나만 허용되므로 로드 시점 스냅샷은 {@code initPersonalCreditDefaults()} 가 함께 호출한다. */
    @PostPersist
    @PostUpdate
    void snapshotAccessState() {
        this.loadedSystemRole = this.systemRole;
    }

    public boolean systemRoleChangedSinceLoad() {
        return this.loadedSystemRole != this.systemRole;
    }

    @Column(name = "deactivated_reason", length = 500)
    private String deactivatedReason;

    // Personal Space
    @Column(name = "personal_space_enabled", nullable = false, columnDefinition = "BOOLEAN NOT NULL DEFAULT false")
    @Builder.Default
    private Boolean personalSpaceEnabled = false;

    // Personal AI Credits
    @Column(name = "personal_ai_credits")
    @Builder.Default
    private Integer personalAiCredits = 30;

    @Column(name = "personal_credits_used")
    @Builder.Default
    private Integer personalCreditsUsed = 0;

    @Column(name = "personal_purchased_credits")
    @Builder.Default
    private Integer personalPurchasedCredits = 0;

    @Column(name = "personal_credits_reset_date")
    private LocalDateTime personalCreditsResetDate;

    /** 달란트로 바꾼 리워드 크레딧. 만료되면 없는 것으로 본다(소비 순서: 월 무료 → 리워드 → 구매). */
    @Column(name = "personal_reward_credits")
    @Builder.Default
    private Integer personalRewardCredits = 0;

    @Column(name = "personal_reward_expires_at")
    private LocalDateTime personalRewardExpiresAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void updateLastLoginAt() {
        this.lastLoginAt = LocalDateTime.now(ZoneOffset.UTC);
        this.lastActiveAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void updateLastActiveAt() {
        this.lastActiveAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void updateProfile(String name, String profileImage) {
        if (name != null) {
            this.name = name;
        }
        if (profileImage != null) {
            this.profileImage = profileImage;
        }
    }

    public void updateProfileImage(String profileImage) {
        this.profileImage = profileImage;
    }

    public void clearProfileImage() {
        this.profileImage = null;
    }

    public void updateTheme(String theme) {
        if (theme != null && (theme.equals("dark") || theme.equals("light"))) {
            this.theme = theme;
        }
    }

    public void updatePassword(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public void linkGoogleAccount(String googleId, String profileImageUrl) {
        this.authProvider = "GOOGLE";
        this.authProviderId = googleId;
        if (profileImageUrl != null && this.profileImage == null) {
            this.profileImage = profileImageUrl;
        }
    }

    public void verifyEmail() {
        this.emailVerified = true;
        this.emailVerifiedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public boolean isAdmin() {
        return this.systemRole == SystemRole.ADMIN;
    }

    public void updateSystemRole(SystemRole systemRole) {
        if (systemRole != null) {
            this.systemRole = systemRole;
        }
    }

    public void deactivate(String reason) {
        this.isActive = false;
        this.deactivatedAt = LocalDateTime.now(ZoneOffset.UTC);
        this.deactivatedReason = reason;
    }

    public void activate() {
        this.isActive = true;
        this.deactivatedAt = null;
        this.deactivatedReason = null;
    }

    // === Personal Space ===

    public void enablePersonalSpace() {
        this.personalSpaceEnabled = true;
    }

    // === Personal AI Credit Management ===

    @PostLoad
    private void initPersonalCreditDefaults() {
        snapshotAccessState();
        if (this.personalAiCredits == null) this.personalAiCredits = 30;
        if (this.personalCreditsUsed == null) this.personalCreditsUsed = 0;
        if (this.personalPurchasedCredits == null) this.personalPurchasedCredits = 0;
        if (this.personalRewardCredits == null) this.personalRewardCredits = 0;
    }

    public int getPersonalAvailableCredits() {
        int purchased = personalPurchasedCredits != null ? personalPurchasedCredits : 0;
        return Math.max(0, personalAiCredits - personalCreditsUsed) + getActivePersonalRewardCredits() + purchased;
    }

    /** 만료 전 리워드 크레딧 (만료됐으면 0) */
    public int getActivePersonalRewardCredits() {
        if (personalRewardCredits == null || personalRewardCredits <= 0) return 0;
        if (personalRewardExpiresAt == null || !personalRewardExpiresAt.isAfter(LocalDateTime.now(ZoneOffset.UTC))) {
            return 0;
        }
        return personalRewardCredits;
    }

    /** 리워드 크레딧 적립 — 만료된 잔여분은 버리고, 만료일은 새 값으로 (교환할 때마다 다음 달 말로 늘어난다) */
    public void addPersonalRewardCredits(int amount, LocalDateTime expiresAt) {
        this.personalRewardCredits = getActivePersonalRewardCredits() + amount;
        this.personalRewardExpiresAt = expiresAt;
    }

    public boolean hasEnoughPersonalCredits(int required) {
        return getPersonalAvailableCredits() >= required;
    }

    public void consumePersonalCredits(int amount) {
        // 월간 크레딧 → 리워드(만료 전) → 구매 크레딧 순서로 차감
        int monthlyRemaining = Math.max(0, personalAiCredits - personalCreditsUsed);
        if (monthlyRemaining >= amount) {
            this.personalCreditsUsed += amount;
            return;
        }
        this.personalCreditsUsed = personalAiCredits;
        int rest = amount - monthlyRemaining;

        int reward = getActivePersonalRewardCredits();
        int fromReward = Math.min(reward, rest);
        if (fromReward > 0) {
            this.personalRewardCredits = reward - fromReward;
            rest -= fromReward;
        }
        if (rest > 0) {
            this.personalPurchasedCredits = Math.max(0, this.personalPurchasedCredits - rest);
        }
    }

    /**
     * 환불 — 월간 사용량을 먼저 되돌리고, 남는 양은 리워드(만료 전일 때만), 그다음 구매 크레딧으로. 어느 칸에서 차감했는지 기록하지 않으므로
     * 사용자에게 가장 유리한(만료 없는 쪽이 뒤) 순서로 돌려준다.
     */
    public void refundPersonalCredits(int amount) {
        int used = personalCreditsUsed != null ? personalCreditsUsed : 0;
        int toMonthly = Math.min(used, amount);
        this.personalCreditsUsed = used - toMonthly;
        int rest = amount - toMonthly;
        if (rest <= 0) return;
        if (personalRewardExpiresAt != null && personalRewardExpiresAt.isAfter(LocalDateTime.now(ZoneOffset.UTC))) {
            this.personalRewardCredits = getActivePersonalRewardCredits() + rest;
            return;
        }
        addPersonalPurchasedCredits(rest);
    }

    public void addPersonalPurchasedCredits(int amount) {
        this.personalPurchasedCredits =
                (this.personalPurchasedCredits != null ? this.personalPurchasedCredits : 0) + amount;
    }

    public void resetPersonalCredits() {
        this.personalCreditsUsed = 0;
        this.personalCreditsResetDate = LocalDateTime.now(ZoneOffset.UTC).plusMonths(1);
    }

    public void initializePersonalCredits() {
        this.personalAiCredits = 30;
        this.personalCreditsUsed = 0;
        this.personalCreditsResetDate = LocalDateTime.now(ZoneOffset.UTC).plusMonths(1);
    }

    public void setPersonalAiCredits(int credits) {
        this.personalAiCredits = credits;
    }

    public void addPersonalBonusCredits(int amount) {
        this.personalAiCredits += amount;
    }
}
