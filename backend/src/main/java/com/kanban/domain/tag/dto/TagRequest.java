package com.kanban.domain.tag.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class TagRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "태그 이름은 필수입니다")
        @Size(max = 50, message = "태그 이름은 50자 이내여야 합니다")
        private String name;

        @Size(max = 20, message = "색상 코드는 20자 이내여야 합니다")
        private String color;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 50, message = "태그 이름은 50자 이내여야 합니다")
        private String name;

        @Size(max = 20, message = "색상 코드는 20자 이내여야 합니다")
        private String color;
    }

    @Getter
    @NoArgsConstructor
    public static class AddTag {
        @NotBlank(message = "태그 ID는 필수입니다")
        private String tagId;
    }
}
