package com.kanban.domain.checklist.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;

/**
 * 체크리스트 요청 DTO.
 * <p>
 * Update(PUT)는 전체 덮어쓰기 시맨틱이며 누락 필드를 null로 간주한다.
 * Patch(PATCH)는 부분 업데이트 시맨틱이며 setter가 호출됐는지를 추적하여
 * "필드 미전송" 과 "필드 명시적 null" 을 구분한다.
 */

public class ChecklistRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "체크리스트 항목 제목은 필수입니다")
        @Size(max = 200, message = "체크리스트 항목 제목은 200자 이내여야 합니다")
        private String title;

        private String assigneeId;

        private String contractorId;

        private LocalDate startDate;

        private LocalDate dueDate;

        /** 서버 내부에서 조립할 때 쓴다 (개인 백로그 → 체크리스트 항목 승격 등). */
        public static Create of(String title, String assigneeId) {
            Create create = new Create();
            create.title = title;
            create.assigneeId = assigneeId;
            return create;
        }
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 200, message = "체크리스트 항목 제목은 200자 이내여야 합니다")
        private String title;

        private String assigneeId;

        private String contractorId;

        private LocalDate startDate;

        private LocalDate dueDate;
    }

    /**
     * PATCH 부분 업데이트 DTO.
     * <p>
     * setter가 호출되면 *_Present 플래그가 true가 되어 "필드가 요청에 포함됐다"는 의미를 보존한다.
     * 따라서 클라이언트가 보내지 않은 필드는 보존되고, 명시적으로 null을 보낸 필드는 클리어된다.
     * (jackson-databind-nullable 의존성을 추가하지 않기 위한 경량 구현)
     */
    @Getter
    @NoArgsConstructor
    public static class Patch {
        @Size(max = 200, message = "체크리스트 항목 제목은 200자 이내여야 합니다")
        private String title;

        private String assigneeId;

        private String contractorId;

        private LocalDate startDate;

        private LocalDate dueDate;

        @JsonIgnore
        private boolean titlePresent;
        @JsonIgnore
        private boolean assigneeIdPresent;
        @JsonIgnore
        private boolean contractorIdPresent;
        @JsonIgnore
        private boolean startDatePresent;
        @JsonIgnore
        private boolean dueDatePresent;

        public void setTitle(String title) {
            this.title = title;
            this.titlePresent = true;
        }

        public void setAssigneeId(String assigneeId) {
            this.assigneeId = assigneeId;
            this.assigneeIdPresent = true;
        }

        public void setContractorId(String contractorId) {
            this.contractorId = contractorId;
            this.contractorIdPresent = true;
        }

        public void setStartDate(LocalDate startDate) {
            this.startDate = startDate;
            this.startDatePresent = true;
        }

        public void setDueDate(LocalDate dueDate) {
            this.dueDate = dueDate;
            this.dueDatePresent = true;
        }

        public boolean hasTitle() { return titlePresent; }
        public boolean hasAssigneeId() { return assigneeIdPresent; }
        public boolean hasContractorId() { return contractorIdPresent; }
        public boolean hasStartDate() { return startDatePresent; }
        public boolean hasDueDate() { return dueDatePresent; }
    }

    @Getter
    @NoArgsConstructor
    public static class CreateFromWorkload {
        @NotBlank(message = "체크리스트 항목 제목은 필수입니다")
        @Size(max = 200, message = "체크리스트 항목 제목은 200자 이내여야 합니다")
        private String title;

        private String assigneeId;
        private String contractorId;
        private LocalDate startDate;
        private LocalDate dueDate;

        private String featureId;
        private String taskId;
        private String newFeatureTitle;
        /** 태스크 자동 생성 시 배정할 마일스톤 (기존 태스크 선택 시 무시) */
        private String milestoneId;
    }

    /**
     * 체크리스트 항목 Task 이동 요청.
     * <p>
     * 두 가지 모드 중 하나:
     * <ul>
     *   <li>기존 Task로 이동: {@code targetTaskId} 지정</li>
     *   <li>새 Task를 만들어 이동: {@code newTask.title} + {@code targetFeatureId} 지정
     *       ({@code targetMilestoneId}는 선택). Task 생성과 이동은 한 트랜잭션으로 처리되어
     *       이동이 실패하면 Task도 남지 않는다.</li>
     * </ul>
     */
    @Getter
    @NoArgsConstructor
    public static class MoveTask {
        /** 기존 Task로 옮길 때의 대상 Task ID. {@code newTask}가 있으면 무시된다. */
        private String targetTaskId;

        /** 새 Task를 만들 피처 ID ({@code newTask}가 있을 때 필수) */
        private String targetFeatureId;

        /** 새 Task에 배정할 마일스톤 ID (선택, 없으면 피처의 대표 마일스톤) */
        private String targetMilestoneId;

        /** 있으면 이 제목으로 Task를 먼저 만들고 그 Task로 옮긴다. */
        @Valid
        private NewTask newTask;

        public boolean hasNewTask() {
            return newTask != null;
        }

        @Getter
        @NoArgsConstructor
        public static class NewTask {
            @NotBlank(message = "새 Task 제목은 필수입니다")
            @Size(max = 200, message = "Task 제목은 200자 이내여야 합니다")
            private String title;
        }
    }

    @Getter
    @NoArgsConstructor
    public static class Reorder {
        @NotNull(message = "항목 ID 목록은 필수입니다")
        private List<String> itemIds;
    }

    /**
     * 체크리스트 병합 요청.
     * targetId(대표 항목)에 sourceIds(흡수될 항목들)의 타임블록을 모으고 소스는 소프트 삭제한다.
     * title/startDate/dueDate 를 보내지 않으면(null) 대표 항목 값을 유지하며,
     * 기간은 병합 대상 전체의 날짜/타임블록 범위로 서버가 자동 확장한다.
     */
    @Getter
    @NoArgsConstructor
    public static class Merge {
        @NotBlank(message = "대표 항목 ID는 필수입니다")
        private String targetId;

        @NotNull(message = "병합 대상 항목 목록은 필수입니다")
        @Size(min = 1, message = "병합 대상 항목이 최소 1개 필요합니다")
        private List<String> sourceIds;

        @Size(max = 200, message = "체크리스트 항목 제목은 200자 이내여야 합니다")
        private String title;

        private LocalDate startDate;

        private LocalDate dueDate;
    }
}
