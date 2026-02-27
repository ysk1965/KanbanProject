package com.kanban.domain.organization.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class OrgGradeRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "직급 이름은 필수입니다")
        @Size(max = 100, message = "직급 이름은 100자 이내여야 합니다")
        private String name;

        private Integer displayOrder;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 100, message = "직급 이름은 100자 이내여야 합니다")
        private String name;

        private Integer displayOrder;
    }
}
