package com.kanban.domain.organization;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "org_anniversary_settings")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OrgAnniversarySetting {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false, unique = true)
    private Organization organization;

    @Column(name = "birthday_enabled", nullable = false)
    @Builder.Default
    private Boolean birthdayEnabled = true;

    @Column(name = "hire_anniversary_enabled", nullable = false)
    @Builder.Default
    private Boolean hireAnniversaryEnabled = true;

    @Enumerated(EnumType.STRING)
    @Column(name = "notify_timing", nullable = false, length = 20)
    @Builder.Default
    private NotifyTiming notifyTiming = NotifyTiming.DAY_BEFORE;

    @Enumerated(EnumType.STRING)
    @Column(name = "dashboard_range", nullable = false, length = 20)
    @Builder.Default
    private DashboardRange dashboardRange = DashboardRange.THIS_MONTH;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public static OrgAnniversarySetting createDefault(Organization org) {
        return OrgAnniversarySetting.builder()
                .organization(org)
                .birthdayEnabled(true)
                .hireAnniversaryEnabled(true)
                .notifyTiming(NotifyTiming.DAY_BEFORE)
                .dashboardRange(DashboardRange.THIS_MONTH)
                .build();
    }

    public void update(Boolean birthdayEnabled, Boolean hireAnniversaryEnabled,
                       NotifyTiming notifyTiming, DashboardRange dashboardRange) {
        if (birthdayEnabled != null) this.birthdayEnabled = birthdayEnabled;
        if (hireAnniversaryEnabled != null) this.hireAnniversaryEnabled = hireAnniversaryEnabled;
        if (notifyTiming != null) this.notifyTiming = notifyTiming;
        if (dashboardRange != null) this.dashboardRange = dashboardRange;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }
}
