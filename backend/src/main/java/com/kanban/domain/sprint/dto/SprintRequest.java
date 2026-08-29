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

    /**
     * 주기 이름·기간 변경. 셋 다 nullable이라 이름만·기간만 따로 바꿀 수 있다.
     * 레벨 1→2 승급 마법사가 "이번 주기는 언제까지"를 받아 여기로 보낸다.
     */
    @Getter
    @NoArgsConstructor
    public static class UpdateSprint {
        private String name;
        private java.time.LocalDate startDate;
        private java.time.LocalDate endDate;
    }

    /**
     * 스프린트 종료 옵션. createNext=false면 다음 스프린트를 만들지 않고 마일스톤을 마무리한다.
     * body 없이 호출하면(기존 클라이언트) createNext=true로 동작한다 — 하위호환.
     */
    @Getter
    @NoArgsConstructor
    public static class CloseSprint {
        private Boolean createNext;
    }

    /** 중간 컬럼 순서 재정렬 (START 다음 ~ END 이전, 순서대로의 컬럼 id 목록) */
    @Getter
    @NoArgsConstructor
    public static class ReorderColumns {
        @NotNull
        private List<String> columnIds;
    }
}
