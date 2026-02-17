package com.kanban.domain.personal.dto;

import com.kanban.domain.personal.PersonalEvent;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

public class PersonalEventResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String title;
        private String description;
        private LocalDate eventDate;
        private LocalTime startTime;
        private LocalTime endTime;
        private String color;
        private boolean allDay;
        private String recurrenceRule;
        private String recurrenceGroupId;
        private LocalDate recurrenceEndDate;
        private String recurrenceDaysOfWeek;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(PersonalEvent event) {
            return Detail.builder()
                    .id(event.getId())
                    .title(event.getTitle())
                    .description(event.getDescription())
                    .eventDate(event.getEventDate())
                    .startTime(event.getStartTime())
                    .endTime(event.getEndTime())
                    .color(event.getColor())
                    .allDay(event.getAllDay())
                    .recurrenceRule(event.getRecurrenceRule())
                    .recurrenceGroupId(event.getRecurrenceGroupId())
                    .recurrenceEndDate(event.getRecurrenceEndDate())
                    .recurrenceDaysOfWeek(event.getRecurrenceDaysOfWeek())
                    .createdAt(event.getCreatedAt())
                    .updatedAt(event.getUpdatedAt())
                    .build();
        }
    }
}
