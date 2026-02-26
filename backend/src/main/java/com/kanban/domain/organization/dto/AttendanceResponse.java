package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.*;
import lombok.Builder;
import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

public class AttendanceResponse {

    @Getter
    @Builder
    public static class RecordDetail {
        private String id;
        private LocalDate recordDate;
        private LocalDateTime clockIn;
        private LocalDateTime clockOut;
        private Integer workMinutes;
        private String status;
        private boolean late;
        private boolean autoClockedOut;
        private String note;

        public static RecordDetail from(OrgAttendanceRecord r) {
            return RecordDetail.builder()
                    .id(r.getId())
                    .recordDate(r.getRecordDate())
                    .clockIn(r.getClockIn())
                    .clockOut(r.getClockOut())
                    .workMinutes(r.getWorkMinutes())
                    .status(r.getStatus().name())
                    .late(r.isLate())
                    .autoClockedOut(r.isAutoClockedOut())
                    .note(r.getNote())
                    .build();
        }
    }

    @Getter
    @Builder
    public static class MyRecordsResponse {
        private MonthlySummary summary;
        private List<RecordDetail> records;
    }

    @Getter
    @Builder
    public static class MonthlySummary {
        private int totalWorkDays;
        private int presentDays;
        private int leaveDays;
        private int absentDays;
        private int lateCount;
        private int totalWorkMinutes;
        private int avgWorkMinutesPerDay;
        private int overtimeMinutes;
    }

    @Getter
    @Builder
    public static class TodayStatus {
        private int presentCount;
        private int absentCount;
        private int onLeaveCount;
        private int totalActiveMembers;
        private MyTodayRecord myRecord;
    }

    @Getter
    @Builder
    public static class MyTodayRecord {
        private LocalDateTime clockIn;
        private LocalDateTime clockOut;
        private String status;
        private Integer elapsedMinutes;
        private Integer workMinutes;
    }

    @Getter
    @Builder
    public static class TeamMemberSummary {
        private String memberId;
        private String memberName;
        private String departmentName;
        private int totalWorkMinutes;
        private int avgWorkMinutesPerDay;
        private int lateCount;
        private int overtimeMinutes;
        private int presentDays;
        private int leaveDays;
        private int absentDays;
    }

    @Getter
    @Builder
    public static class TeamSummaryResponse {
        private List<TeamMemberSummary> members;
    }

    @Getter
    @Builder
    public static class PolicyResponse {
        private String id;
        private BigDecimal standardHours;
        private LocalTime coreTimeStart;
        private LocalTime coreTimeEnd;
        private LocalTime lateThreshold;
        private boolean autoClockOut;
        private LocalTime autoClockOutTime;
        private String weekendDays;

        public static PolicyResponse from(OrgAttendancePolicy p) {
            return PolicyResponse.builder()
                    .id(p.getId())
                    .standardHours(p.getStandardHours())
                    .coreTimeStart(p.getCoreTimeStart())
                    .coreTimeEnd(p.getCoreTimeEnd())
                    .lateThreshold(p.getLateThreshold())
                    .autoClockOut(p.isAutoClockOut())
                    .autoClockOutTime(p.getAutoClockOutTime())
                    .weekendDays(p.getWeekendDays())
                    .build();
        }
    }

    @Getter
    @Builder
    public static class HolidayResponse {
        private String id;
        private LocalDate holidayDate;
        private String name;
        private boolean recurring;

        public static HolidayResponse from(OrgCustomHoliday h) {
            return HolidayResponse.builder()
                    .id(h.getId())
                    .holidayDate(h.getHolidayDate())
                    .name(h.getName())
                    .recurring(h.isRecurring())
                    .build();
        }
    }
}
