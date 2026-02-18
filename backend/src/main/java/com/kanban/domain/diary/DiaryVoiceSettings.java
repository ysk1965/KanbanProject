package com.kanban.domain.diary;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "diary_voice_settings")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DiaryVoiceSettings extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Column(name = "voice_type", nullable = false, length = 20)
    @Builder.Default
    private String voiceType = "nova";

    @Column(name = "auto_play", nullable = false)
    @Builder.Default
    private Boolean autoPlay = true;

    @Column(name = "speed", nullable = false)
    @Builder.Default
    private BigDecimal speed = BigDecimal.ONE;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void update(String voiceType, Boolean autoPlay, BigDecimal speed) {
        if (voiceType != null) this.voiceType = voiceType;
        if (autoPlay != null) this.autoPlay = autoPlay;
        if (speed != null) this.speed = speed;
    }
}
