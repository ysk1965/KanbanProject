package com.kanban.domain.organization.service;

import com.kanban.domain.organization.*;
import com.kanban.domain.organization.dto.*;
import com.kanban.domain.organization.repository.OrgAnniversarySettingRepository;
import com.kanban.domain.organization.repository.OrgCelebrationMessageRepository;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoField;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrgAnniversaryService {

    private final OrgAnniversarySettingRepository settingRepository;
    private final OrgCelebrationMessageRepository messageRepository;
    private final OrgMemberRepository orgMemberRepository;
    private final OrganizationService organizationService;
    private final OrgActivityService activityService;
    private final UserRepository userRepository;

    // ==================== Upcoming Anniversaries ====================

    @Transactional
    public UpcomingAnniversaryResponse.ListResponse getUpcomingAnniversaries(
            String orgId, String userId, String range) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        OrgAnniversarySetting settings = getOrCreateSettings(orgId);
        boolean birthdayEnabled = settings.getBirthdayEnabled();
        boolean hireEnabled = settings.getHireAnniversaryEnabled();

        if (!birthdayEnabled && !hireEnabled) {
            return UpcomingAnniversaryResponse.ListResponse.builder()
                    .today(Collections.emptyList())
                    .thisWeek(Collections.emptyList())
                    .thisMonth(Collections.emptyList())
                    .build();
        }

        // Get active members
        List<OrganizationMember> activeMembers = orgMemberRepository.findActiveMembers(
                orgId, List.of(WorkStatus.ACTIVE, WorkStatus.ON_LEAVE));

        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        DashboardRange dashboardRange;
        if (range != null) {
            try {
                dashboardRange = DashboardRange.valueOf(range);
            } catch (IllegalArgumentException e) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
            }
        } else {
            dashboardRange = settings.getDashboardRange();
        }

        // Calculate date boundaries
        LocalDate weekEnd = today.plusDays(7 - today.getDayOfWeek().getValue());
        LocalDate monthEnd = today.with(TemporalAdjusters.lastDayOfMonth());
        LocalDate rangeEnd = dashboardRange == DashboardRange.THIS_WEEK ? weekEnd : monthEnd;

        List<UpcomingAnniversaryResponse.AnniversaryItem> todayItems = new ArrayList<>();
        List<UpcomingAnniversaryResponse.AnniversaryItem> weekItems = new ArrayList<>();
        List<UpcomingAnniversaryResponse.AnniversaryItem> monthItems = new ArrayList<>();

        for (OrganizationMember member : activeMembers) {
            User user = member.getUser();
            String deptName = member.getDepartment() != null ? member.getDepartment().getName() : null;

            // Birthday check
            if (birthdayEnabled && member.getBirthDate() != null) {
                LocalDate birthdayThisYear = getAnniversaryDateThisYear(member.getBirthDate(), today);
                if (birthdayThisYear != null && !birthdayThisYear.isBefore(today)
                        && !birthdayThisYear.isAfter(rangeEnd)) {
                    long msgCount = messageRepository.countByTargetMemberIdAndAnniversaryTypeAndAnniversaryDate(
                            member.getId(), AnniversaryType.BIRTHDAY, birthdayThisYear);

                    UpcomingAnniversaryResponse.AnniversaryItem item =
                            UpcomingAnniversaryResponse.AnniversaryItem.builder()
                                    .memberId(member.getId())
                                    .memberName(user.getName())
                                    .profileImageUrl(user.getProfileImage())
                                    .departmentName(deptName)
                                    .type(AnniversaryType.BIRTHDAY.name())
                                    .date(birthdayThisYear)
                                    .years(null)
                                    .messageCount(msgCount)
                                    .build();

                    categorizeItem(item, birthdayThisYear, today, weekEnd, todayItems, weekItems, monthItems);
                }
            }

            // Hire anniversary check
            if (hireEnabled && member.getHireDate() != null) {
                LocalDate hireAnniversary = getAnniversaryDateThisYear(member.getHireDate(), today);
                if (hireAnniversary != null && !hireAnniversary.isBefore(today)
                        && !hireAnniversary.isAfter(rangeEnd)) {
                    int years = today.getYear() - member.getHireDate().getYear();
                    if (years <= 0) continue; // Skip if hired this year (no anniversary yet)

                    long msgCount = messageRepository.countByTargetMemberIdAndAnniversaryTypeAndAnniversaryDate(
                            member.getId(), AnniversaryType.HIRE_ANNIVERSARY, hireAnniversary);

                    UpcomingAnniversaryResponse.AnniversaryItem item =
                            UpcomingAnniversaryResponse.AnniversaryItem.builder()
                                    .memberId(member.getId())
                                    .memberName(user.getName())
                                    .profileImageUrl(user.getProfileImage())
                                    .departmentName(deptName)
                                    .type(AnniversaryType.HIRE_ANNIVERSARY.name())
                                    .date(hireAnniversary)
                                    .years(years)
                                    .messageCount(msgCount)
                                    .build();

                    categorizeItem(item, hireAnniversary, today, weekEnd, todayItems, weekItems, monthItems);
                }
            }
        }

        // Sort each list by date
        Comparator<UpcomingAnniversaryResponse.AnniversaryItem> byDate =
                Comparator.comparing(UpcomingAnniversaryResponse.AnniversaryItem::getDate);
        todayItems.sort(byDate);
        weekItems.sort(byDate);
        monthItems.sort(byDate);

        return UpcomingAnniversaryResponse.ListResponse.builder()
                .today(todayItems)
                .thisWeek(weekItems)
                .thisMonth(monthItems)
                .build();
    }

    // ==================== Celebration Messages ====================

    public CelebrationMessageResponse.ListResponse getMessages(
            String orgId, String memberId, String userId,
            String type, String dateStr, String cursor, int size) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        AnniversaryType anniversaryType;
        try {
            anniversaryType = AnniversaryType.valueOf(type);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
        LocalDate date = LocalDate.parse(dateStr);

        List<OrgCelebrationMessage> items;
        if (cursor != null) {
            LocalDateTime cursorDt = LocalDateTime.parse(cursor);
            items = messageRepository.findMessagesWithCursor(
                    memberId, anniversaryType, date, cursorDt, PageRequest.of(0, size + 1));
        } else {
            items = messageRepository.findMessages(
                    memberId, anniversaryType, date, PageRequest.of(0, size + 1));
        }

        return CelebrationMessageResponse.ListResponse.of(items, size);
    }

    @Transactional
    public CelebrationMessageResponse.Detail createMessage(
            String orgId, String memberId, String userId,
            CelebrationMessageRequest.Create request) {
        Organization org = organizationService.getActiveOrgOrThrow(orgId);
        organizationService.getOrgMemberOrThrow(orgId, userId);

        // Check target member exists and is not RESIGNED
        OrganizationMember targetMember = orgMemberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        if (!targetMember.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND);
        }
        if (targetMember.getWorkStatus() == WorkStatus.RESIGNED) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND);
        }

        AnniversaryType anniversaryType;
        try {
            anniversaryType = AnniversaryType.valueOf(request.getType());
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
        LocalDate anniversaryDate = LocalDate.parse(request.getDate());

        // Check duplicate
        boolean exists = messageRepository.existsByTargetMemberIdAndAuthorIdAndAnniversaryTypeAndAnniversaryDate(
                memberId, userId, anniversaryType, anniversaryDate);
        if (exists) {
            throw new BusinessException(ErrorCode.CELEBRATION_MESSAGE_ALREADY_EXISTS);
        }

        User author = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        OrgCelebrationMessage message = OrgCelebrationMessage.create(
                org, targetMember, author, anniversaryType, anniversaryDate, request.getMessage());
        messageRepository.save(message);

        // Log activity
        activityService.log(org, author.getName(), OrgActivityType.ANNIVERSARY_CELEBRATED,
                targetMember.getUser().getName(),
                Map.of("type", anniversaryType.name(), "date", anniversaryDate.toString()));

        return CelebrationMessageResponse.Detail.of(message);
    }

    @Transactional
    public CelebrationMessageResponse.Detail updateMessage(
            String orgId, String memberId, String messageId, String userId,
            CelebrationMessageRequest.Update request) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        OrgCelebrationMessage message = messageRepository.findById(messageId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CELEBRATION_MESSAGE_NOT_FOUND));

        // Check author
        if (!message.getAuthor().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.CELEBRATION_MESSAGE_FORBIDDEN);
        }

        message.updateMessage(request.getMessage());
        return CelebrationMessageResponse.Detail.of(message);
    }

    @Transactional
    public void deleteMessage(String orgId, String memberId, String messageId, String userId) {
        OrganizationMember caller = organizationService.getOrgMemberOrThrow(orgId, userId);

        OrgCelebrationMessage message = messageRepository.findById(messageId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CELEBRATION_MESSAGE_NOT_FOUND));

        // Check: author == userId OR user is Admin+
        if (!message.getAuthor().getId().equals(userId) && !caller.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.CELEBRATION_MESSAGE_FORBIDDEN);
        }

        messageRepository.delete(message);
    }

    // ==================== Anniversary Settings ====================

    @Transactional
    public AnniversarySettingResponse getSettings(String orgId, String userId) {
        organizationService.checkAdminOrAbove(orgId, userId);
        OrgAnniversarySetting settings = getOrCreateSettings(orgId);
        return AnniversarySettingResponse.of(settings);
    }

    @Transactional
    public AnniversarySettingResponse updateSettings(
            String orgId, String userId, AnniversarySettingRequest request) {
        organizationService.checkAdminOrAbove(orgId, userId);
        OrgAnniversarySetting settings = getOrCreateSettings(orgId);

        NotifyTiming notifyTiming = null;
        if (request.getNotifyTiming() != null) {
            try {
                notifyTiming = NotifyTiming.valueOf(request.getNotifyTiming());
            } catch (IllegalArgumentException e) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
            }
        }
        DashboardRange dashboardRange = null;
        if (request.getDashboardRange() != null) {
            try {
                dashboardRange = DashboardRange.valueOf(request.getDashboardRange());
            } catch (IllegalArgumentException e) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
            }
        }

        settings.update(
                request.getBirthdayEnabled(),
                request.getHireAnniversaryEnabled(),
                notifyTiming,
                dashboardRange);

        return AnniversarySettingResponse.of(settings);
    }

    // ==================== Helper Methods ====================

    private OrgAnniversarySetting getOrCreateSettings(String orgId) {
        return settingRepository.findByOrganizationId(orgId)
                .orElseGet(() -> {
                    Organization org = organizationService.getActiveOrgOrThrow(orgId);
                    OrgAnniversarySetting defaultSetting = OrgAnniversarySetting.createDefault(org);
                    return settingRepository.save(defaultSetting);
                });
    }

    /**
     * Get the anniversary date for the current year, handling leap year for Feb 29.
     * If the original date is Feb 29 and the current year is not a leap year, use Feb 28.
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
            log.warn("Failed to calculate anniversary date for {} in year {}",
                    originalDate, currentYear);
            return null;
        }
    }

    private void categorizeItem(UpcomingAnniversaryResponse.AnniversaryItem item,
                                 LocalDate itemDate, LocalDate today, LocalDate weekEnd,
                                 List<UpcomingAnniversaryResponse.AnniversaryItem> todayItems,
                                 List<UpcomingAnniversaryResponse.AnniversaryItem> weekItems,
                                 List<UpcomingAnniversaryResponse.AnniversaryItem> monthItems) {
        if (itemDate.isEqual(today)) {
            todayItems.add(item);
        } else if (!itemDate.isAfter(weekEnd)) {
            weekItems.add(item);
        } else {
            monthItems.add(item);
        }
    }
}
