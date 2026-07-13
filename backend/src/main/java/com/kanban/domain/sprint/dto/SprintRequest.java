package com.kanban.domain.sprint.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class SprintRequest {

    /** 스프린트 토글 on/off (A안) */
    @Getter
    @NoArgsConstructor
    public static class ToggleMode {
        @NotNull
        private Boolean enabled;
    }

    /** 체크리스트 항목 담기 */
    @Getter
    @NoArgsConstructor
    public static class AddItem {
        @NotNull
        private String checklistItemId;
    }

    /** 카드 단계 이동 (sprint / review / done) */
    @Getter
    @NoArgsConstructor
    public static class MoveStage {
        @NotNull
        private String stage;
    }
}
