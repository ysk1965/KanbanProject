package com.kanban.domain.calendar.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.kanban.domain.calendar.CalendarEventType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

public class CalendarEventRequest {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Create {
        @NotNull(message = "일정 종류는 필수입니다")
        private CalendarEventType eventType;

        /** 개인 부재(휴가/출장/병가/재택)일 때 필수. */
        private String memberId;

        @Size(max = 100, message = "제목은 100자 이하여야 합니다")
        private String title;

        @NotNull(message = "시작일은 필수입니다")
        @JsonFormat(pattern = "yyyy-MM-dd")
        private LocalDate startDate;

        @NotNull(message = "종료일은 필수입니다")
        @JsonFormat(pattern = "yyyy-MM-dd")
        private LocalDate endDate;

        @Size(max = 7, message = "색상은 7자 이하여야 합니다")
        private String color;

        private Boolean recurring;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Update {
        private CalendarEventType eventType;

        private String memberId;

        @Size(max = 100, message = "제목은 100자 이하여야 합니다")
        private String title;

        @JsonFormat(pattern = "yyyy-MM-dd")
        private LocalDate startDate;

        @JsonFormat(pattern = "yyyy-MM-dd")
        private LocalDate endDate;

        @Size(max = 7, message = "색상은 7자 이하여야 합니다")
        private String color;

        private Boolean recurring;
    }
}
