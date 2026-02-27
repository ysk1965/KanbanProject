package com.kanban.domain.organization.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class CelebrationMessageRequest {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Create {
        @NotBlank
        private String type;

        @NotBlank
        private String date;

        @NotBlank
        @Size(max = 500)
        private String message;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Update {
        @NotBlank
        @Size(max = 500)
        private String message;
    }
}
