package com.kanban.domain.organization.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Getter
@NoArgsConstructor
public class AttendanceRequest {

    @Getter
    @NoArgsConstructor
    public static class UpdatePolicy {
        private BigDecimal standardHours;
        private String coreTimeStart;
        private String coreTimeEnd;
        private String lateThreshold;
        private Boolean autoClockOut;
        private String autoClockOutTime;
        private String weekendDays;
    }

    @Getter
    @NoArgsConstructor
    public static class AdminModify {
        private String clockIn;
        private String clockOut;
        private String note;
    }

    @Getter
    @NoArgsConstructor
    public static class CreateHoliday {
        private String holidayDate;
        private String name;
        private boolean recurring;
    }
}
