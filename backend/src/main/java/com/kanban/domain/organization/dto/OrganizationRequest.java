package com.kanban.domain.organization.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class OrganizationRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "조직 이름은 필수입니다")
        @Size(max = 100, message = "조직 이름은 100자 이내여야 합니다")
        private String name;

        private String description;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 100, message = "조직 이름은 100자 이내여야 합니다")
        private String name;

        private String description;
    }

    @Getter
    @NoArgsConstructor
    public static class TransferOwnership {
        @NotBlank(message = "새 소유자 멤버 ID는 필수입니다")
        private String memberId;
    }
}
