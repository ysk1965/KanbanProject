package com.kanban.domain.personal.dto;

import com.kanban.domain.personal.PersonalTaskPriority;
import com.kanban.domain.personal.PersonalTaskPromotionType;
import com.kanban.domain.personal.PersonalTaskStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalTime;

public class PersonalTaskRequest {

    @Getter
    public static class Create {
        @NotBlank
        @Size(max = 200)
        private String title;

        private String description;
        private PersonalTaskPriority priority;
        private LocalDate dueDate;
        private String category;
        private String color;

        /**
         * 보드 대시보드 백로그로 적을 때의 보드 id. 없으면 마이스페이스 전역 항목이다.
         * 이 값이 있으면 마감일 자동 지정(오늘)도 하지 않는다 — 백로그는 날짜가 없는 게 기본이다.
         */
        private String boardId;
    }

    @Getter
    public static class Update {
        @Size(max = 200)
        private String title;

        private String description;
        private PersonalTaskPriority priority;
        private LocalDate dueDate;
        private String category;
        private String color;
    }

    @Getter
    public static class StatusUpdate {
        private PersonalTaskStatus status;
    }

    @Getter
    public static class PositionUpdate {
        private PersonalTaskStatus status;
        private Integer position;
    }

    /**
     * 백로그 항목 승격 요청.
     *
     * <p>필요한 필드는 target에 따라 다르다 — 서비스에서 검증한다.
     * <ul>
     *   <li>TIMEBLOCK      : scheduledDate, startTime, endTime</li>
     *   <li>TASK           : featureId (태스크는 피처에 속한다)</li>
     *   <li>CHECKLIST_ITEM : taskId</li>
     * </ul>
     */
    @Getter
    public static class Promote {
        @NotNull(message = "승격 대상은 필수입니다")
        private PersonalTaskPromotionType target;

        /** target=TASK — 태스크가 붙을 피처 */
        private String featureId;

        /** target=CHECKLIST_ITEM — 항목이 붙을 태스크 */
        private String taskId;

        /** target=TIMEBLOCK */
        private LocalDate scheduledDate;
        private LocalTime startTime;
        private LocalTime endTime;

        /** target=TASK — 간트 날짜 칸에 떨궜을 때 그 날짜로 배치한다 */
        private LocalDate startDate;
        private LocalDate dueDate;
    }
}
