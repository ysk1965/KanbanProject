package com.kanban.domain.personal.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Getter
@Builder
@AllArgsConstructor
public class UnifiedCalendarResponse {

    private List<PersonalEventResponse.Detail> personalEvents;
    private List<BoardEvent> boardEvents;
    private List<OrgEvent> orgEvents;

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BoardEvent {
        private String source; // MEETING, SCHEDULE_BLOCK
        private String boardId;
        private String boardName;

        // MEETING fields
        private String meetingId;

        // SCHEDULE_BLOCK fields
        private String scheduleBlockId;
        private String taskTitle;

        // Common
        private String title;
        private LocalDate eventDate;
        private LocalTime startTime;
        private LocalTime endTime;
        private String color;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class OrgEvent {
        private String source; // ANNIVERSARY, LEAVE
        private String orgId;
        private String orgName;
        private String title;
        private LocalDate eventDate;

        // ANNIVERSARY fields
        private String anniversaryType; // BIRTHDAY, HIRE_ANNIVERSARY

        // LEAVE fields
        private LocalDate endDate;
        private String leaveType; // ANNUAL, SICK, etc.

        private String color;
    }
}
