package com.kanban.domain.personal.dto;

import com.kanban.domain.personal.PersonalTaskPriority;
import com.kanban.domain.personal.PersonalTaskStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;

import java.time.LocalDate;

public class PersonalTaskRequest {

    @Getter
    public static class Create {
        @NotBlank
        @Size(max = 200)
        private String title;

        private String description;
        private PersonalTaskPriority priority;
        private LocalDate dueDate;
        private String category;
        private String color;
    }

    @Getter
    public static class Update {
        @Size(max = 200)
        private String title;

        private String description;
        private PersonalTaskPriority priority;
        private LocalDate dueDate;
        private String category;
        private String color;
    }

    @Getter
    public static class StatusUpdate {
        private PersonalTaskStatus status;
    }

    @Getter
    public static class PositionUpdate {
        private PersonalTaskStatus status;
        private Integer position;
    }
}
