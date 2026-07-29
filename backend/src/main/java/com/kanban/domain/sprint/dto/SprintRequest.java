package com.kanban.domain.sprint.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

public class SprintRequest {

    /** 스프린트 토글 on/off (A안) */
    @Getter
    @NoArgsConstructor
    public static class ToggleMode {
        @NotNull
        private Boolean enabled;
    }

    /** 태스크 담기 (담기 단위는 태스크 — 체크리스트는 태스크를 따라 함께 들어온다) */
    @Getter
    @NoArgsConstructor
    public static class AddTask {
        @NotNull
        private String taskId;
    }

    /** 카드 컬럼 이동 (대상 컬럼 id) */
    @Getter
    @NoArgsConstructor
    public static class MoveColumn {
        @NotNull
        private String columnId;
    }

    /** 중간 컬럼 생성 */
    @Getter
    @NoArgsConstructor
    public static class CreateColumn {
        @NotNull
        private String name;
        private String color;
    }

    /** 컬럼 이름/색 변경 */
    @Getter
    @NoArgsConstructor
    public static class UpdateColumn {
        private String name;
        private String color;
    }

    /** 중간 컬럼 순서 재정렬 (START 다음 ~ END 이전, 순서대로의 컬럼 id 목록) */
    @Getter
    @NoArgsConstructor
    public static class ReorderColumns {
        @NotNull
        private List<String> columnIds;
    }
}
