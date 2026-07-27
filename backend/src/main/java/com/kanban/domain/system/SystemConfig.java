package com.kanban.domain.system;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

@Entity
@Table(name = "system_config")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SystemConfig {

    @Id
    @Column(name = "config_key", length = 100)
    private String key;

    @Column(name = "config_value", columnDefinition = "TEXT")
    private String value;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    /** 마지막으로 이 설정을 바꾼 사용자 ID. 시스템이 갱신했으면 null. */
    @Column(name = "updated_by", length = 36)
    private String updatedBy;

    public void updateValue(String value) {
        updateValue(value, null);
    }

    public void updateValue(String value, String updatedBy) {
        this.value = value;
        this.updatedBy = updatedBy;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }
}
