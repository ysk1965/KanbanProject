package com.kanban.domain.board.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;
import org.hibernate.validator.constraints.URL;

import java.util.List;

public class BoardResourceRequest {

    @Data
    public static class Create {
        @NotBlank
        @Size(max = 100)
        private String title;

        @NotBlank
        @Size(max = 2000)
        @URL
        private String url;

        @Size(max = 255)
        private String description;
    }

    @Data
    public static class Update {
        @NotBlank
        @Size(max = 100)
        private String title;

        @NotBlank
        @Size(max = 2000)
        @URL
        private String url;

        @Size(max = 255)
        private String description;
    }

    @Data
    public static class Reorder {
        @NotNull
        private List<String> resourceIds;
    }
}
