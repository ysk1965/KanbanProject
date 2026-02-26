package com.kanban.domain.organization.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.util.List;

public class OnboardingRequest {

    @Getter
    @NoArgsConstructor
    public static class CreateTemplate {
        @NotBlank
        @Size(max = 100)
        private String name;
        @Size(max = 500)
        private String description;
        private boolean autoAssign = true;
        private String targetDepartmentId;
        private String targetJobGroupId;
        @Valid
        private List<TemplateItemRequest> items;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateTemplate {
        @NotBlank
        @Size(max = 100)
        private String name;
        @Size(max = 500)
        private String description;
        private boolean autoAssign = true;
        private String targetDepartmentId;
        private String targetJobGroupId;
        @Valid
        private List<TemplateItemRequest> items;
    }

    @Getter
    @NoArgsConstructor
    public static class TemplateItemRequest {
        @NotBlank
        @Size(max = 200)
        private String title;
        @Size(max = 500)
        private String description;
        private Integer dueDayOffset;
        private String assigneeRole; // MANAGER, SELF
    }

    @Getter
    @NoArgsConstructor
    public static class CreateInstance {
        @NotBlank
        private String memberId;
        @NotBlank
        private String templateId;
    }
}
