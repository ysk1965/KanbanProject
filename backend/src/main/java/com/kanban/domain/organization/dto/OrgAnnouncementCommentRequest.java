package com.kanban.domain.organization.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class OrgAnnouncementCommentRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank
        @Size(max = 1000)
        private String content;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @NotBlank
        @Size(max = 1000)
        private String content;
    }
}
