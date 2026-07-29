package com.kanban.domain.dailychecklist.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

public class DailyChecklistRequest {

    /**
     * 기존 체크리스트 아이템을 데일리 체크리스트에 추가
     */
    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "체크리스트 아이템 ID는 필수입니다")
        private String checklistItemId;

        @NotBlank(message = "담당자 ID는 필수입니다")
        private String assigneeId;

        @NotNull(message = "할당 날짜는 필수입니다")
        private LocalDate assignedDate;
    }

    /**
     * 새 체크리스트 아이템을 생성하면서 데일리 체크리스트에 추가
     */
    @Getter
    @NoArgsConstructor
    public static class CreateWithItem {
        @NotBlank(message = "Task ID는 필수입니다")
        private String taskId;

        @NotBlank(message = "제목은 필수입니다")
        @Size(max = 200, message = "제목은 200자 이내여야 합니다")
        private String title;

        @NotBlank(message = "담당자 ID는 필수입니다")
        private String assigneeId;

        @NotNull(message = "할당 날짜는 필수입니다")
        private LocalDate assignedDate;
    }

    /**
     * 오늘의 체크리스트에서 항목 빼기.
     * 원본 체크리스트는 건드리지 않고 해당 날짜에만 제외한다.
     */
    @Getter
    @NoArgsConstructor
    public static class Exclude {
        @NotBlank(message = "체크리스트 아이템 ID는 필수입니다")
        private String checklistItemId;

        @NotNull(message = "제외할 날짜는 필수입니다")
        private LocalDate assignedDate;

        /** 생략하면 체크리스트 항목의 담당자를 사용한다 */
        private String assigneeId;
    }

    /**
     * 데일리 체크리스트 아이템 순서 변경
     */
    @Getter
    @NoArgsConstructor
    public static class UpdatePosition {
        @NotNull(message = "위치는 필수입니다")
        private Integer position;
    }
}
