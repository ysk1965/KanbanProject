package com.kanban.domain.organization;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "org_attendance_policies")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class OrgAttendancePolicy {

    @Id
    @Column(length = 36)
    private String id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false, unique = true)
    private Organization organization;

    @Column(name = "standard_hours", nullable = false, precision = 4, scale = 2)
    private BigDecimal standardHours = new BigDecimal("8.00");

    @Column(name = "core_time_start")
    private LocalTime coreTimeStart;

    @Column(name = "core_time_end")
    private LocalTime coreTimeEnd;

    @Column(name = "late_threshold")
    private LocalTime lateThreshold;

    @Column(name = "auto_clock_out", nullable = false)
    private boolean autoClockOut = true;

    @Column(name = "auto_clock_out_time", nullable = false)
    private LocalTime autoClockOutTime = LocalTime.of(23, 59);

    @Column(name = "weekend_days", nullable = false, length = 20)
    private String weekendDays = "6,7";

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    public OrgAttendancePolicy(Organization organization) {
        this.id = UUID.randomUUID().toString();
        this.organization = organization;
    }

    public void update(BigDecimal standardHours, LocalTime coreTimeStart, LocalTime coreTimeEnd,
                       LocalTime lateThreshold, boolean autoClockOut, LocalTime autoClockOutTime,
                       String weekendDays) {
        if (standardHours != null) this.standardHours = standardHours;
        if (coreTimeStart != null) this.coreTimeStart = coreTimeStart;
        if (coreTimeEnd != null) this.coreTimeEnd = coreTimeEnd;
        this.lateThreshold = lateThreshold;
        this.autoClockOut = autoClockOut;
        if (autoClockOutTime != null) this.autoClockOutTime = autoClockOutTime;
        if (weekendDays != null) this.weekendDays = weekendDays;
    }

    public boolean isWeekend(int dayOfWeek) {
        // dayOfWeek: 1=Monday ... 7=Sunday
        for (String d : weekendDays.split(",")) {
            if (d.trim().equals(String.valueOf(dayOfWeek))) return true;
        }
        return false;
    }
}
