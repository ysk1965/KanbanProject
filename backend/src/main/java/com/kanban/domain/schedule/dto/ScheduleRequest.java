package com.kanban.domain.schedule.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public class ScheduleRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        private String checklistItemId;
        private String meetingId;

        private String blockType;  // "CHECKLIST", "MEETING", "CUSTOM"

        @Size(max = 100, message = "제목은 100자 이내여야 합니다")
        private String title;      // CUSTOM 타입에서 사용 (e.g., "점심", "티타임")

        private String color;      // HEX color (e.g., "#F59E0B") - CUSTOM 타입에서 사용

        @NotBlank(message = "담당자 ID는 필수입니다")
        private String assigneeId;

        @NotNull(message = "예정일은 필수입니다")
        private LocalDate scheduledDate;

        @NotNull(message = "시작 시간은 필수입니다")
        private LocalTime startTime;

        @NotNull(message = "종료 시간은 필수입니다")
        private LocalTime endTime;

        /** 서버 내부에서 CUSTOM 블록을 조립할 때 쓴다 (개인 백로그 → 타임블록 승격 등). */
        public static Create custom(String title, String assigneeId, LocalDate scheduledDate,
                                    LocalTime startTime, LocalTime endTime) {
            Create create = new Create();
            create.blockType = "CUSTOM";
            create.title = title;
            create.assigneeId = assigneeId;
            create.scheduledDate = scheduledDate;
            create.startTime = startTime;
            create.endTime = endTime;
            return create;
        }
    }

    @Getter
    @NoArgsConstructor
    public static class CreateWithChecklistItem {
        @NotBlank(message = "담당자 ID는 필수입니다")
        private String assigneeId;

        @NotNull(message = "예정일은 필수입니다")
        private LocalDate scheduledDate;

        @NotNull(message = "시작 시간은 필수입니다")
        private LocalTime startTime;

        @NotNull(message = "종료 시간은 필수입니다")
        private LocalTime endTime;

        @Valid
        @NotNull(message = "체크리스트 항목 정보는 필수입니다")
        private ChecklistItemInfo checklistItem;
    }

    @Getter
    @NoArgsConstructor
    public static class ChecklistItemInfo {
        @NotBlank(message = "Task ID는 필수입니다")
        private String taskId;

        @NotBlank(message = "체크리스트 항목 제목은 필수입니다")
        @Size(max = 200, message = "체크리스트 항목 제목은 200자 이내여야 합니다")
        private String title;

        private LocalDate startDate;
        private LocalDate dueDate;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        private LocalTime startTime;
        private LocalTime endTime;

        @Size(max = 100, message = "제목은 100자 이내여야 합니다")
        private String title;

        @Size(max = 7, message = "색상 코드는 7자 이내여야 합니다")
        private String color;
    }

    /**
     * 타임블록을 다른 체크리스트 항목으로 재지정 (같은 보드 내).
     * 실수로 다른 항목에 붙은 타임블록을 올바른 항목으로 옮길 때 사용.
     */
    @Getter
    @NoArgsConstructor
    public static class ReassignChecklistItem {
        @NotBlank(message = "대상 체크리스트 항목 ID는 필수입니다")
        private String checklistItemId;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateSettings {
        private Integer workHoursPerDay;
        private LocalTime workStartTime;
        private String scheduleDisplayMode;
        private LocalTime breakStartTime;
        private LocalTime breakEndTime;
    }

    @Getter
    @NoArgsConstructor
    public static class BatchChecklistItemSchedules {
        @NotNull(message = "체크리스트 아이템 ID 목록은 필수입니다")
        private List<String> checklistItemIds;
    }
}
