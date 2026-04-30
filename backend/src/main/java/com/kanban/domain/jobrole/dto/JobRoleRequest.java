package com.kanban.domain.jobrole.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

public class JobRoleRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "직군 이름은 필수입니다")
        @Size(max = 50, message = "직군 이름은 50자 이내여야 합니다")
        private String name;

        @Size(max = 20, message = "색상 코드는 20자 이내여야 합니다")
        private String color;

        @Size(max = 30, message = "아이콘 이름은 30자 이내여야 합니다")
        private String icon;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 50, message = "직군 이름은 50자 이내여야 합니다")
        private String name;

        @Size(max = 20, message = "색상 코드는 20자 이내여야 합니다")
        private String color;

        @Size(max = 30, message = "아이콘 이름은 30자 이내여야 합니다")
        private String icon;
    }

    @Getter
    @NoArgsConstructor
    public static class Reorder {
        @NotEmpty(message = "직군 ID 목록은 필수입니다")
        private List<String> ids;
    }
}
