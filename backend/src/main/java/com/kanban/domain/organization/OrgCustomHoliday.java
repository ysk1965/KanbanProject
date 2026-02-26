package com.kanban.domain.organization;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "org_custom_holidays")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class OrgCustomHoliday {

    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @Column(name = "holiday_date", nullable = false)
    private LocalDate holidayDate;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "is_recurring", nullable = false)
    private boolean recurring;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    public OrgCustomHoliday(Organization organization, LocalDate holidayDate, String name, boolean recurring) {
        this.id = UUID.randomUUID().toString();
        this.organization = organization;
        this.holidayDate = holidayDate;
        this.name = name;
        this.recurring = recurring;
    }
}
