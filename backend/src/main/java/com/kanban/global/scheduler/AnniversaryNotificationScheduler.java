package com.kanban.global.scheduler;

import com.kanban.domain.notification.service.NotificationService;
import com.kanban.domain.organization.*;
import com.kanban.domain.organization.repository.OrgAnniversarySettingRepository;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.domain.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class AnniversaryNotificationScheduler {

    private final OrgAnniversarySettingRepository settingRepository;
    private final OrgMemberRepository orgMemberRepository;
    private final NotificationService notificationService;

    /**
     * Runs every hour at :00 to check for anniversary notifications.
     * For each organization with anniversary settings enabled, checks all active members
     * whose local timezone is currently 09:00, and sends notifications for matching anniversaries.
     */
    @Scheduled(cron = "0 0 * * * *")
    @Transactional
    public void processAnniversaryNotifications() {
        LocalDateTime nowUtc = LocalDateTime.now(ZoneOffset.UTC);
        int currentUtcHour = nowUtc.getHour();

        log.debug("Anniversary notification scheduler running at {:02d}:00 UTC", currentUtcHour);

        List<OrgAnniversarySetting> allSettings = settingRepository.findAll();

        for (OrgAnniversarySetting settings : allSettings) {
            try {
                if (!settings.getBirthdayEnabled() && !settings.getHireAnniversaryEnabled()) {
                    continue;
                }

                processOrganization(settings, nowUtc);
            } catch (Exception e) {
                log.error("Failed to process anniversary notifications for org {}: {}",
                        settings.getOrganization().getId(), e.getMessage(), e);
            }
        }
    }

    private void processOrganization(OrgAnniversarySetting settings, LocalDateTime nowUtc) {
        String orgId = settings.getOrganization().getId();
        String orgName = settings.getOrganization().getName();
        NotifyTiming notifyTiming = settings.getNotifyTiming();

        List<OrganizationMember> activeMembers = orgMemberRepository.findActiveMembers(
                orgId, List.of(WorkStatus.ACTIVE, WorkStatus.ON_LEAVE));

        for (OrganizationMember member : activeMembers) {
            try {
                ZoneId zoneId = resolveTimezone(member);

                // Check if it's 09:00 in the member's local timezone
                ZonedDateTime memberLocalTime = nowUtc.atZone(ZoneOffset.UTC).withZoneSameInstant(zoneId);
                if (memberLocalTime.getHour() != 9) {
                    continue;
                }

                LocalDate memberLocalDate = memberLocalTime.toLocalDate();

                // Check birthday
                if (settings.getBirthdayEnabled() && member.getBirthDate() != null) {
                    checkAndNotify(member, AnniversaryType.BIRTHDAY,
                            member.getBirthDate(), memberLocalDate, notifyTiming,
                            activeMembers, orgId, orgName, nowUtc);
                }

                // Check hire anniversary
                if (settings.getHireAnniversaryEnabled() && member.getHireDate() != null) {
                    int years = memberLocalDate.getYear() - member.getHireDate().getYear();
                    if (years > 0) {
                        checkAndNotify(member, AnniversaryType.HIRE_ANNIVERSARY,
                                member.getHireDate(), memberLocalDate, notifyTiming,
                                activeMembers, orgId, orgName, nowUtc);
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to check anniversary for member {}: {}",
                        member.getId(), e.getMessage());
            }
        }
    }

    private void checkAndNotify(OrganizationMember member, AnniversaryType type,
                                 LocalDate originalDate, LocalDate today,
                                 NotifyTiming notifyTiming,
                                 List<OrganizationMember> allMembers,
                                 String orgId, String orgName,
                                 LocalDateTime nowUtc) {
        LocalDate anniversaryThisYear = getAnniversaryDateThisYear(originalDate, today);
        if (anniversaryThisYear == null) return;

        // Check if today matches any notification date based on timing
        boolean shouldNotify = today.isEqual(anniversaryThisYear);
        if (!shouldNotify) {
            switch (notifyTiming) {
                case DAY_BEFORE:
                    shouldNotify = today.isEqual(anniversaryThisYear.minusDays(1));
                    break;
                case THREE_DAYS_BEFORE:
                    shouldNotify = today.isEqual(anniversaryThisYear.minusDays(3))
                            || today.isEqual(anniversaryThisYear.minusDays(2))
                            || today.isEqual(anniversaryThisYear.minusDays(1));
                    break;
                default:
                    break;
            }
        }

        if (!shouldNotify) return;

        User targetUser = member.getUser();
        String memberName = targetUser.getName();

        // Build notification content
        String title;
        String message;
        if (type == AnniversaryType.BIRTHDAY) {
            title = memberName + "님의 생일입니다";
            message = "축하 메시지를 보내보세요!";
            log.info("[Anniversary] {} birthday on {} (org: {})", memberName, anniversaryThisYear, orgName);
        } else {
            int years = today.getYear() - originalDate.getYear();
            title = memberName + "님의 입사 " + years + "주년입니다";
            message = "축하 메시지를 보내보세요!";
            log.info("[Anniversary] {} {}th hire anniversary on {} (org: {})",
                    memberName, years, anniversaryThisYear, orgName);
        }

        // Send In-App + FCM push notifications to all OTHER active members
        // Idempotency: check per-recipient to avoid duplicate notifications
        LocalDateTime startOfDayUtc = nowUtc.toLocalDate().atStartOfDay();
        for (OrganizationMember recipient : allMembers) {
            if (recipient.getId().equals(member.getId())) {
                continue; // Skip the anniversary member themselves
            }

            try {
                // Skip if this recipient already received a notification about this target today
                if (notificationService.hasAnniversaryNotificationForRecipient(
                        recipient.getUser().getId(), targetUser.getId(), startOfDayUtc)) {
                    continue;
                }

                notificationService.createAnniversaryNotification(
                        recipient.getUser(), targetUser,
                        orgId, orgName,
                        type.name(), title, message);
            } catch (Exception e) {
                log.warn("Failed to send anniversary notification to member {}: {}",
                        recipient.getId(), e.getMessage());
            }
        }
    }

    private ZoneId resolveTimezone(OrganizationMember member) {
        String timezone = member.getTimezone() != null ? member.getTimezone() : "Asia/Seoul";
        try {
            return ZoneId.of(timezone);
        } catch (Exception e) {
            return ZoneId.of("Asia/Seoul");
        }
    }

    /**
     * Get the anniversary date for the current year, handling leap year for Feb 29.
     */
    private LocalDate getAnniversaryDateThisYear(LocalDate originalDate, LocalDate today) {
        int month = originalDate.getMonthValue();
        int day = originalDate.getDayOfMonth();
        int currentYear = today.getYear();

        // Handle Feb 29 in non-leap year
        if (month == 2 && day == 29 && !today.isLeapYear()) {
            return LocalDate.of(currentYear, 2, 28);
        }

        try {
            return LocalDate.of(currentYear, month, day);
        } catch (Exception e) {
            return null;
        }
    }
}
