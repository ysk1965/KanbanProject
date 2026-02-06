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
    // TODO: 라이브 서비스 전 SystemRole.USER로 변경 필요
    private SystemRole systemRole = SystemRole.TESTER;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private Boolean isActive = true;

    @Column(name = "deactivated_at")
    private LocalDateTime deactivatedAt;

    @Column(name = "deactivated_reason", length = 500)
    private String deactivatedReason;

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
}
