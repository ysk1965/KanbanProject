package com.kanban.domain.pilsa;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.*;

/** 필사한 절 하나. 지우지 않는다. (user_id, week, book, chapter, verse) 유니크가 같은 절의 중복 기록을 막는다. */
@Entity
@Table(
        name = "pilsa_verses",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uq_pilsa_verses_user_week_bcv",
                        columnNames = {"user_id", "week", "book", "chapter", "verse"}),
        indexes = @Index(name = "idx_pilsa_verses_user_week", columnList = "user_id, week"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PilsaVerse {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "week", nullable = false)
    private LocalDate week;

    /** 0 = 창세기 … 65 = 요한계시록 */
    @Column(name = "book", nullable = false)
    private int book;

    @Column(name = "chapter", nullable = false)
    private int chapter;

    @Column(name = "verse", nullable = false)
    private int verse;

    /** 비교한 글자 수(공백·문장 부호 제외) */
    @Column(name = "chars", nullable = false)
    private int chars;

    /** 첫 입력부터 끝까지 걸린 시간 */
    @Column(name = "ms", nullable = false)
    private int ms;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }
}
