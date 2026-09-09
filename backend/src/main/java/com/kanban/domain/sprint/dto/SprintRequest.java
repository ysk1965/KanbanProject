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
     * 스프린트 분할 생성/조정.
     *  · count       = 버킷 개수 (1 = 나누지 않음)
     *  · boundaries  = 스프린트 2..N의 시작일 (생략 시 균등 분배)
     *  · taskDistribution = keep(기본) | unassign | by_date
     */
    @Getter
    @NoArgsConstructor
    public static class Split {
        @NotNull
        private Integer count;
        private List<java.time.LocalDate> boundaries;
        private String taskDistribution;
    }

    /**
     * 체크리스트 줄의 스프린트 지정 일괄 변경.
     *  · sprintId = null 이면 지정 해제(태스크 따라가기).
     *  · 태스크의 스프린트와 같은 값을 주면 서버가 지정을 지워 상속으로 정규화한다.
     */
    @Getter
    @NoArgsConstructor
    public static class SetChecklistSprint {
        @NotNull
        private List<String> itemIds;
        private String sprintId;
    }

    /**
     * 미완료 이월 — 줄 단위. 둘 다 비어 있으면(본문 없음) 이 스프린트의 미완료 줄 전부가 대상이다.
     *  · itemIds = 다음 스프린트로 보낼 미완료 줄
     *  · taskIds = 체크리스트가 없는 태스크(줄이 없어 태스크 자체가 한 줄) 중 보낼 것
     */
    @Getter
    @NoArgsConstructor
    public static class PushUnfinished {
        private List<String> itemIds;
        private List<String> taskIds;
    }

    /** 중간 컬럼 순서 재정렬 (START 다음 ~ END 이전, 순서대로의 컬럼 id 목록) */
    @Getter
    @NoArgsConstructor
    public static class ReorderColumns {
        @NotNull
        private List<String> columnIds;
    }
}
