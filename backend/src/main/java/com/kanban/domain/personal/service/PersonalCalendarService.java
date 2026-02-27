package com.kanban.domain.personal.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.meeting.MeetingRepository;
import com.kanban.domain.organization.*;
import com.kanban.domain.organization.leave.LeaveRequest;
import com.kanban.domain.organization.leave.repository.LeaveRequestRepository;
import com.kanban.domain.organization.repository.OrgAnniversarySettingRepository;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.domain.personal.PersonalEvent;
import com.kanban.domain.personal.PersonalEventRepository;
import com.kanban.domain.personal.dto.PersonalEventResponse;
import com.kanban.domain.personal.dto.UnifiedCalendarResponse;
import com.kanban.domain.schedule.ScheduleBlock;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PersonalCalendarService {

    private final PersonalEventRepository personalEventRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final MeetingRepository meetingRepository;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final OrgMemberRepository orgMemberRepository;
    private final OrgAnniversarySettingRepository orgAnniversarySettingRepository;
    private final LeaveRequestRepository leaveRequestRepository;

    public UnifiedCalendarResponse getUnifiedCalendar(String userId, LocalDate startDate, LocalDate endDate) {
        // 1. Personal events
        List<PersonalEventResponse.Detail> personalEvents = personalEventRepository
                .findByUserIdAndDateRange(userId, startDate, endDate).stream()
                .map(PersonalEventResponse.Detail::of)
                .toList();

        // 2. Board events (meetings + schedule blocks)
        List<UnifiedCalendarResponse.BoardEvent> boardEvents = getBoardEvents(userId, startDate, endDate);

        // 3. Org events (anniversaries + leaves)
        List<UnifiedCalendarResponse.OrgEvent> orgEvents = getOrgEvents(userId, startDate, endDate);

        return UnifiedCalendarResponse.builder()
                .personalEvents(personalEvents)
                .boardEvents(boardEvents)
                .orgEvents(orgEvents)
                .build();
    }

    private List<UnifiedCalendarResponse.BoardEvent> getBoardEvents(String userId, LocalDate startDate, LocalDate endDate) {
        List<BoardMember> boardMembers = boardMemberRepository.findByUserIdWithActiveBoards(userId);
        if (boardMembers.isEmpty()) {
            return Collections.emptyList();
        }

        List<String> boardIds = boardMembers.stream()
                .map(bm -> bm.getBoard().getId())
                .toList();

        Map<String, Board> boardMap = boardMembers.stream()
                .collect(Collectors.toMap(bm -> bm.getBoard().getId(), BoardMember::getBoard, (a, b) -> a));

        List<UnifiedCalendarResponse.BoardEvent> events = new ArrayList<>();

        // Meetings
        List<Meeting> meetings = meetingRepository.findByBoardIdInAndMeetingDateBetween(boardIds, startDate, endDate);
        for (Meeting m : meetings) {
            Board board = boardMap.getOrDefault(m.getBoard().getId(), m.getBoard());
            events.add(UnifiedCalendarResponse.BoardEvent.builder()
                    .source("MEETING")
                    .boardId(board.getId())
                    .boardName(board.getName())
                    .meetingId(m.getId())
                    .title(m.getTitle())
                    .eventDate(m.getMeetingDate())
                    .startTime(m.getStartTime())
                    .endTime(m.getEndTime())
                    .color(m.getColor())
                    .build());
        }

        // Schedule blocks
        List<ScheduleBlock> scheduleBlocks = scheduleBlockRepository
                .findByAssigneeIdAndBoardIdInAndScheduledDateBetween(userId, boardIds, startDate, endDate);
        for (ScheduleBlock sb : scheduleBlocks) {
            Board board = boardMap.getOrDefault(sb.getBoard().getId(), sb.getBoard());
            String taskTitle = null;
            if (sb.getChecklistItem() != null && sb.getChecklistItem().getTask() != null) {
                taskTitle = sb.getChecklistItem().getTask().getTitle();
            }
            events.add(UnifiedCalendarResponse.BoardEvent.builder()
                    .source("SCHEDULE_BLOCK")
                    .boardId(board.getId())
                    .boardName(board.getName())
                    .scheduleBlockId(sb.getId())
                    .title(sb.getTitle() != null ? sb.getTitle() : (sb.getChecklistItem() != null ? sb.getChecklistItem().getTitle() : ""))
                    .taskTitle(taskTitle)
                    .eventDate(sb.getScheduledDate())
                    .startTime(sb.getStartTime())
                    .endTime(sb.getEndTime())
                    .color(sb.getColor())
                    .build());
        }

        return events;
    }

    private List<UnifiedCalendarResponse.OrgEvent> getOrgEvents(String userId, LocalDate startDate, LocalDate endDate) {
        List<OrganizationMember> orgMemberships = orgMemberRepository.findByUserIdWithOrganization(userId);
        if (orgMemberships.isEmpty()) {
            return Collections.emptyList();
        }

        List<UnifiedCalendarResponse.OrgEvent> events = new ArrayList<>();

        List<String> orgIds = new ArrayList<>();
        Map<String, Organization> orgMap = new HashMap<>();
        for (OrganizationMember om : orgMemberships) {
            Organization org = om.getOrganization();
            if (!org.isDeleted()) {
                orgIds.add(org.getId());
                orgMap.put(org.getId(), org);
            }
        }
        if (orgIds.isEmpty()) {
            return Collections.emptyList();
        }

        // Anniversaries
        for (String orgId : orgIds) {
            Organization org = orgMap.get(orgId);
            Optional<OrgAnniversarySetting> settingOpt = orgAnniversarySettingRepository.findByOrganizationId(orgId);
            if (settingOpt.isEmpty()) continue;

            OrgAnniversarySetting settings = settingOpt.get();
            boolean birthdayEnabled = settings.getBirthdayEnabled();
            boolean hireEnabled = settings.getHireAnniversaryEnabled();
            if (!birthdayEnabled && !hireEnabled) continue;

            List<OrganizationMember> activeMembers = orgMemberRepository.findActiveMembers(
                    orgId, List.of(WorkStatus.ACTIVE, WorkStatus.ON_LEAVE));

            for (OrganizationMember member : activeMembers) {
                // Birthday
                if (birthdayEnabled && member.getBirthDate() != null) {
                    LocalDate birthdayThisYear = getAnniversaryDateThisYear(member.getBirthDate(), startDate);
                    if (birthdayThisYear != null
                            && !birthdayThisYear.isBefore(startDate)
                            && !birthdayThisYear.isAfter(endDate)) {
                        events.add(UnifiedCalendarResponse.OrgEvent.builder()
                                .source("ANNIVERSARY")
                                .orgId(org.getId())
                                .orgName(org.getName())
                                .title(member.getUser().getName() + "님 생일")
                                .eventDate(birthdayThisYear)
                                .anniversaryType(AnniversaryType.BIRTHDAY.name())
                                .color("#F472B6")
                                .build());
                    }
                }

                // Hire anniversary
                if (hireEnabled && member.getHireDate() != null) {
                    LocalDate hireAnniversary = getAnniversaryDateThisYear(member.getHireDate(), startDate);
                    if (hireAnniversary != null
                            && !hireAnniversary.isBefore(startDate)
                            && !hireAnniversary.isAfter(endDate)) {
                        int years = startDate.getYear() - member.getHireDate().getYear();
                        if (years > 0) {
                            events.add(UnifiedCalendarResponse.OrgEvent.builder()
                                    .source("ANNIVERSARY")
                                    .orgId(org.getId())
                                    .orgName(org.getName())
                                    .title(member.getUser().getName() + "님 입사 " + years + "주년")
                                    .eventDate(hireAnniversary)
                                    .anniversaryType(AnniversaryType.HIRE_ANNIVERSARY.name())
                                    .color("#F472B6")
                                    .build());
                        }
                    }
                }
            }
        }

        // Leaves
        List<LeaveRequest> approvedLeaves = leaveRequestRepository
                .findApprovedByOrgIdInAndDateRange(orgIds, startDate, endDate);
        for (LeaveRequest lr : approvedLeaves) {
            Organization org = orgMap.get(lr.getOrganization().getId());
            if (org == null) continue;

            String memberName = lr.getRequester().getUser().getName();
            String leaveCategory = lr.getPolicy().getLeaveCategory().name();

            events.add(UnifiedCalendarResponse.OrgEvent.builder()
                    .source("LEAVE")
                    .orgId(org.getId())
                    .orgName(org.getName())
                    .title(lr.getPolicy().getName() + " (" + memberName + ")")
                    .eventDate(lr.getStartDate())
                    .endDate(lr.getEndDate())
                    .leaveType(leaveCategory)
                    .color("#34D399")
                    .build());
        }

        return events;
    }

    /**
     * Get the anniversary date for the current year, handling leap year for Feb 29.
     */
    private LocalDate getAnniversaryDateThisYear(LocalDate originalDate, LocalDate referenceDate) {
        int month = originalDate.getMonthValue();
        int day = originalDate.getDayOfMonth();
        int currentYear = referenceDate.getYear();

        if (month == 2 && day == 29 && !referenceDate.isLeapYear()) {
            return LocalDate.of(currentYear, 2, 28);
        }

        try {
            return LocalDate.of(currentYear, month, day);
        } catch (Exception e) {
            log.warn("Failed to calculate anniversary date for {} in year {}", originalDate, currentYear);
            return null;
        }
    }
}
