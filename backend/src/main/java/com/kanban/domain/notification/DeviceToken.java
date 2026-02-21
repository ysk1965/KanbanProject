package com.kanban.domain.notification;

import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "device_tokens", indexes = {
        @Index(name = "idx_device_token_user", columnList = "user_id"),
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DeviceToken {

    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "token", nullable = false, length = 512, unique = true)
    private String token;

    @Column(name = "platform", nullable = false, length = 10)
    @Enumerated(EnumType.STRING)
    private Platform platform;

    @Column(name = "device_info", length = 200)
    private String deviceInfo;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public enum Platform {
        IOS, ANDROID, WEB
    }

    @PrePersist
    public void prePersist() {
        if (this.id == null) this.id = UUID.randomUUID().toString();
        if (this.createdAt == null) this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void updateToken(String newToken) {
        this.token = newToken;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }
}
