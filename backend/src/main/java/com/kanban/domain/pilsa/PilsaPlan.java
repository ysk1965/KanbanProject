package com.kanban.domain.pilsa;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.*;

/**
 * 한 사용자의 한 주 필사 계획(일곱 장). 그 주에 처음 받은 것을 고정한다 — (user_id, week) 유니크가 먼저 온 것을 이기게 한다.
 *
 * <p>chapters 는 JSON 배열 문자열: [{"b":44,"c":5,"reason":"main","verses":21}, …]
 */
@Entity
@Table(
        name = "pilsa_plans",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uq_pilsa_plans_user_week",
                        columnNames = {"user_id", "week"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PilsaPlan {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    /** 챌린지 주 키(월요일) */
    @Column(name = "week", nullable = false)
    private LocalDate week;

    @Column(name = "chapters", nullable = false, columnDefinition = "TEXT")
    private String chapters;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }
}
