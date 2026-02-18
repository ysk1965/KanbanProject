package com.kanban.domain.user;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
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

    @Column(name = "deactivated_reason", length = 500)
    private String deactivatedReason;

    // Personal Space
    @Column(name = "personal_space_enabled", nullable = false)
    @Builder.Default
    private Boolean personalSpaceEnabled = false;

    // Personal AI Credits
    @Column(name = "personal_ai_credits")
    @Builder.Default
    private Integer personalAiCredits = 30;

    @Column(name = "personal_credits_used")
    @Builder.Default
    private Integer personalCreditsUsed = 0;

    @Column(name = "personal_credits_reset_date")
    private LocalDateTime personalCreditsResetDate;

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
        if (this.personalAiCredits == null) this.personalAiCredits = 30;
        if (this.personalCreditsUsed == null) this.personalCreditsUsed = 0;
    }

    public int getPersonalAvailableCredits() {
        return Math.max(0, personalAiCredits - personalCreditsUsed);
    }

    public boolean hasEnoughPersonalCredits(int required) {
        return getPersonalAvailableCredits() >= required;
    }

    public void consumePersonalCredits(int amount) {
        this.personalCreditsUsed += amount;
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
}
