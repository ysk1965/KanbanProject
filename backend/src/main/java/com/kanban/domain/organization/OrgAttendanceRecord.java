package com.kanban.domain.organization;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import com.kanban.domain.user.User;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

@Entity
@Table(name = "org_attendance_records")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class OrgAttendanceRecord {

    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private OrganizationMember member;

    @Column(name = "record_date", nullable = false)
    private LocalDate recordDate;

    @Column(name = "clock_in")
    private LocalDateTime clockIn;

    @Column(name = "clock_out")
    private LocalDateTime clockOut;

    @Column(name = "work_minutes")
    private Integer workMinutes;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AttendanceStatus status = AttendanceStatus.ABSENT;

    @Column(name = "is_late", nullable = false)
    private boolean late;

    @Column(name = "is_auto_clocked_out", nullable = false)
    private boolean autoClockedOut;

    @Column(length = 300)
    private String note;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "modified_by")
    private User modifiedBy;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    public OrgAttendanceRecord(Organization organization, OrganizationMember member,
                                LocalDate recordDate, LocalDateTime clockIn,
                                AttendanceStatus status, boolean late) {
        this.id = UUID.randomUUID().toString();
        this.organization = organization;
        this.member = member;
        this.recordDate = recordDate;
        this.clockIn = clockIn;
        this.status = status;
        this.late = late;
    }

    public void clockOut(LocalDateTime clockOutTime) {
        this.clockOut = clockOutTime;
        if (this.clockIn != null) {
            this.workMinutes = (int) ChronoUnit.MINUTES.between(this.clockIn, clockOutTime);
        }
    }

    public void autoClockOut(LocalDateTime clockOutTime) {
        clockOut(clockOutTime);
        this.autoClockedOut = true;
    }

    public void cancelClockOut() {
        this.clockOut = null;
        this.workMinutes = null;
        this.autoClockedOut = false;
    }

    public void adminModify(LocalDateTime clockIn, LocalDateTime clockOut, String note, User modifiedBy) {
        this.clockIn = clockIn;
        this.clockOut = clockOut;
        if (clockIn != null && clockOut != null) {
            this.workMinutes = (int) ChronoUnit.MINUTES.between(clockIn, clockOut);
        }
        this.note = note;
        this.modifiedBy = modifiedBy;
    }

    public void recordClockIn(LocalDateTime clockInTime, boolean isLate) {
        this.clockIn = clockInTime;
        this.late = isLate;
    }

    public void updateStatus(AttendanceStatus status) {
        this.status = status;
    }

    public void softDelete() {
        this.deletedAt = LocalDateTime.now(ZoneOffset.UTC);
    }
}
