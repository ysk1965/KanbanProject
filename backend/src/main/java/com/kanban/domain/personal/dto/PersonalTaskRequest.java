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
import java.util.List;

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

    /**
     * 붙일 곳 추천 요청.
     *
     * <p>규칙 추천은 무료라 모달을 열 때 바로 부르고, useAi=true는 사용자가 버튼을 눌렀을 때만 온다.
     * 열자마자 AI를 돌리면 백로그 열 개 정리에 크레딧 열 개가 나간다.
     */
    @Getter
    public static class Suggest {
        /** TASK(붙일 피처 추천) 또는 CHECKLIST_ITEM(붙일 태스크 추천). TIMEBLOCK은 추천 대상이 아니다. */
        @NotNull(message = "추천 대상은 필수입니다")
        private PersonalTaskPromotionType target;

        /** 모달에서 고른 마일스톤. null이면 전체, "none"이면 마일스톤 미배정만. */
        private String milestoneId;

        /** 완료된 것도 후보에 넣을지 — 모달의 "완료 포함" 토글과 같은 값 */
        private boolean includeDone;

        /** true면 크레딧 1을 쓰고 AI가 고른다. false면 규칙 결과만 돌려준다. */
        private boolean useAi;

        /** 최근에 붙인 곳 — 프런트가 localStorage에 들고 있는 값이라 서버가 알 수 없다 */
        private List<String> recentRefIds;

        /** AI가 이유를 쓸 언어 (i18n 코드). 규칙 추천에는 쓰이지 않는다. */
        private String language;
    }
}
