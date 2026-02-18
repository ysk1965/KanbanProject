package com.kanban.domain.personal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;

public class PersonalTagRequest {

    @Getter
    public static class Create {
        @NotBlank
        @Size(max = 50)
        private String name;

        private String color;
    }

    @Getter
    public static class Update {
        @Size(max = 50)
        private String name;

        private String color;
    }
}
