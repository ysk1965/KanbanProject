package com.kanban.domain.checklist.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
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
    }

    @Getter
    @NoArgsConstructor
    public static class MoveTask {
        @NotNull(message = "이동할 Task ID는 필수입니다")
        private String targetTaskId;
    }

    @Getter
    @NoArgsConstructor
    public static class Reorder {
        @NotNull(message = "항목 ID 목록은 필수입니다")
        private List<String> itemIds;
    }
}
