package com.kanban.domain.personal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalTime;

public class PersonalEventRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "일정 제목은 필수입니다")
        @Size(max = 200, message = "제목은 200자 이내여야 합니다")
        private String title;

        private String description;

        @NotNull(message = "일정 날짜는 필수입니다")
        private LocalDate eventDate;

        private LocalTime startTime;
        private LocalTime endTime;
        private String color;
        private Boolean allDay;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 200, message = "제목은 200자 이내여야 합니다")
        private String title;

        private String description;
        private LocalDate eventDate;
        private LocalTime startTime;
        private LocalTime endTime;
        private String color;
        private Boolean allDay;
    }
}
