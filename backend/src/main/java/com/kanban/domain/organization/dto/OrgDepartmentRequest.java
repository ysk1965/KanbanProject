package com.kanban.domain.organization.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class OrgDepartmentRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "부서 이름은 필수입니다")
        @Size(max = 100, message = "부서 이름은 100자 이내여야 합니다")
        private String name;

        private Integer displayOrder;
        private String parentDepartmentId;
        private String leaderId;
        @Size(max = 500)
        private String description;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 100, message = "부서 이름은 100자 이내여야 합니다")
        private String name;

        private Integer displayOrder;
        private String parentDepartmentId;
        private String leaderId;
        @Size(max = 500)
        private String description;
    }
}
