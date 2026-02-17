package com.kanban.domain.meeting.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public class MeetingRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "회의 제목은 필수입니다")
        @Size(max = 200, message = "회의 제목은 200자 이내여야 합니다")
        private String title;

        @NotNull(message = "회의 날짜는 필수입니다")
        private LocalDate meetingDate;

        private LocalTime startTime;
        private LocalTime endTime;
        private String memo;
        private String color;
        private String recurrenceRule;
        private LocalDate recurrenceEndDate;
        private List<Integer> recurrenceDaysOfWeek;
        private Integer recurrenceWeekOfMonth;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 200, message = "회의 제목은 200자 이내여야 합니다")
        private String title;

        private LocalDate meetingDate;
        private LocalTime startTime;
        private LocalTime endTime;
        private String memo;
        private String color;
    }
}
