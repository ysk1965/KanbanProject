package com.kanban.domain.board.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class BoardRequest {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Create {
        @NotBlank(message = "보드 이름은 필수입니다")
        @Size(max = 100, message = "보드 이름은 100자 이내여야 합니다")
        private String name;

        private String description;

        private String backgroundGradient;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 100, message = "보드 이름은 100자 이내여야 합니다")
        private String name;

        private String description;

        private String backgroundGradient;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateSelectedMilestone {
        private String milestoneId;
    }

    /**
     * 화면 복잡도 변경. 둘 다 nullable — 레벨만 올리거나 옵션만 토글하는 요청을
     * 각각 보낼 수 있게 한다(서랍의 토글 하나가 레벨을 건드리면 안 된다).
     */
    @Getter
    @NoArgsConstructor
    public static class UpdateUiConfig {
        /** 1~3. 범위 밖 값은 엔티티에서 잘라낸다. */
        private Integer uiLevel;
        /** 쉼표 구분 옵션 키. 모르는 키는 서버가 버린다. */
        private String uiOptions;
    }
}
