package com.kanban.domain.task.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;

public class TaskRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "Task 제목은 필수입니다")
        @Size(max = 200, message = "Task 제목은 200자 이내여야 합니다")
        private String title;

        private String description;

        private LocalDate startDate;

        private LocalDate dueDate;

        private Integer estimatedMinutes;

        /** 배정할 마일스톤 ID (선택). 없으면 피처의 대표 마일스톤으로 설정된다. */
        private String milestoneId;

        /** 서버 내부에서 조립할 때 쓴다 (개인 백로그 → 태스크 승격 등). */
        public static Create of(String title, LocalDate startDate, LocalDate dueDate) {
            Create create = new Create();
            create.title = title;
            create.startDate = startDate;
            create.dueDate = dueDate;
            return create;
        }
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 200, message = "Task 제목은 200자 이내여야 합니다")
        private String title;

        private String description;

        private LocalDate startDate;

        private LocalDate dueDate;

        private Integer estimatedMinutes;

        /**
         * 배정할 마일스톤 ID. 전달되면 마일스톤을 재배정한다.
         * 빈 문자열("")이면 마일스톤 해제(null). null(미전달)이면 변경하지 않는다.
         */
        private String milestoneId;
    }

    @Getter
    @NoArgsConstructor
    public static class Move {
        @NotNull(message = "이동할 블록 ID는 필수입니다")
        private String targetBlockId;

        private Integer position;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateDates {
        private LocalDate startDate;

        private LocalDate endDate;
    }

    @Getter
    @NoArgsConstructor
    public static class MoveFeature {
        @NotNull(message = "이동할 Feature ID는 필수입니다")
        private String targetFeatureId;
    }

    @Getter
    @NoArgsConstructor
    public static class ReorderFeatureTasks {
        @NotNull(message = "Task ID 목록은 필수입니다")
        private List<String> taskIds;
    }

    @Getter
    @NoArgsConstructor
    public static class MoveToBoard {
        @NotBlank(message = "대상 보드 ID는 필수입니다")
        private String targetBoardId;

        @NotBlank(message = "대상 블록 ID는 필수입니다")
        private String targetBlockId;
    }

    @Getter
    @NoArgsConstructor
    public static class CopyToBoard {
        @NotBlank(message = "대상 보드 ID는 필수입니다")
        private String targetBoardId;

        @NotBlank(message = "대상 블록 ID는 필수입니다")
        private String targetBlockId;
    }
}
