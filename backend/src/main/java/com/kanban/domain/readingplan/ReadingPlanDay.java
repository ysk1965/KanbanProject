package com.kanban.domain.readingplan;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** 길의 하루. chapters 는 "b:c" 장 키 1~10개 (JSON — PostgreSQL jsonb, H2 json). */
@Entity
@Table(
        name = "reading_plan_days",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uq_rpd_plan_day",
                        columnNames = {"plan_id", "day_no"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ReadingPlanDay {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "plan_id", nullable = false, length = 36)
    private String planId;

    @Column(name = "day_no", nullable = false)
    private int dayNo;

    @Column(name = "date", nullable = false)
    private LocalDate date;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "chapters", nullable = false)
    @Builder.Default
    private List<String> chapters = new ArrayList<>();

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }
}
