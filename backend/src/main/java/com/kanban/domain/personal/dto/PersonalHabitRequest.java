package com.kanban.domain.personal.dto;

import com.kanban.domain.personal.HabitFrequency;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;

public class PersonalHabitRequest {

    @Getter
    public static class Create {
        @NotBlank
        @Size(max = 200)
        private String title;

        private String description;
        private String icon;
        private String color;
        private HabitFrequency frequencyType;
        private String frequencyDays;
        private Integer targetCount;
        private String unit;
    }

    @Getter
    public static class Update {
        @Size(max = 200)
        private String title;

        private String description;
        private String icon;
        private String color;
        private HabitFrequency frequencyType;
        private String frequencyDays;
        private Integer targetCount;
        private String unit;
    }

    @Getter
    public static class PositionUpdate {
        private Integer position;
    }

    @Getter
    public static class CheckIn {
        private String note;
    }
}
