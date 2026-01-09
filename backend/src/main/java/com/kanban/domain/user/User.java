package com.kanban.domain.user;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
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

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void updateLastLoginAt() {
        this.lastLoginAt = LocalDateTime.now();
    }

    public void updateProfile(String name, String profileImage) {
        if (name != null) {
            this.name = name;
        }
        if (profileImage != null) {
            this.profileImage = profileImage;
        }
    }

    public void updatePassword(String passwordHash) {
        this.passwordHash = passwordHash;
    }
}
