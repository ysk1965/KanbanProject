package com.kanban.domain.block.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

public class BlockRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "블록 이름은 필수입니다")
        @Size(max = 50, message = "블록 이름은 50자 이내여야 합니다")
        private String name;

        @Size(max = 20, message = "색상 코드는 20자 이내여야 합니다")
        private String color;

        private String milestoneId;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 50, message = "블록 이름은 50자 이내여야 합니다")
        private String name;

        @Size(max = 20, message = "색상 코드는 20자 이내여야 합니다")
        private String color;

        private Boolean showProgressBar;
    }

    @Getter
    @NoArgsConstructor
    public static class Reorder {
        @NotNull(message = "블록 ID 목록은 필수입니다")
        private List<String> blockIds;
    }
}
