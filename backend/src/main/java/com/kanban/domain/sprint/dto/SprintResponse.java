package com.kanban.domain.sprint.dto;

import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.sprint.Sprint;
import com.kanban.domain.sprint.SprintStage;
import com.kanban.domain.task.Task;
import com.kanban.domain.user.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 스프린트 보드 응답. Jackson SNAKE_CASE 전략으로 camelCase 필드는 snake_case JSON으로 직렬화된다.
 */
public class SprintResponse {

    /** 스프린트 프레임 전체 상태 (조회/변경 공통 반환) */
    @Getter
    @AllArgsConstructor
    @Builder
    public static class Board {
        private boolean sprintEnabled;
        private SprintInfo activeSprint;      // 활성 스프린트 없으면 null
        private List<SprintInfo> sprints;     // 타임라인 (활성 + 아카이브)
        private Gauge gauge;                   // 스코프 게이지 (활성 기준)
        private Columns columns;               // Sprint / Review / Done 3컬럼
        private List<ItemCard> backlog;        // 담기 후보 (아직 미담긴 마일스톤 항목)
    }

    @Getter
    @AllArgsConstructor
    @Builder
    public static class Columns {
        private List<ItemCard> sprint;
        private List<ItemCard> review;
        private List<ItemCard> done;
    }

    /** 스코프 게이지 = done / total (Done 포함). 역설 해소의 핵심. */
    @Getter
    @AllArgsConstructor
    @Builder
    public static class Gauge {
        private int done;
        private int total;
        private int percentage;

        public static Gauge of(int done, int total) {
            int pct = total > 0 ? Math.round(done * 100f / total) : 0;
            return Gauge.builder().done(done).total(total).percentage(pct).build();
        }
    }

    @Getter
    @AllArgsConstructor
    @Builder
    public static class SprintInfo {
        private String id;
        private String name;
        private int sequenceNo;
        private String status;
        private LocalDate startDate;
        private LocalDate endDate;
        private int completedCount;
        private int totalCount;
        private int progressPercentage;
        private LocalDateTime archivedAt;

        public static SprintInfo of(Sprint s, int progressPercentage) {
            return SprintInfo.builder()
                    .id(s.getId())
                    .name(s.getName())
                    .sequenceNo(s.getSequenceNo())
                    .status(s.getStatus().name())
                    .startDate(s.getStartDate())
                    .endDate(s.getEndDate())
                    .completedCount(s.getCompletedCount())
                    .totalCount(s.getTotalCount())
                    .progressPercentage(progressPercentage)
                    .archivedAt(s.getArchivedAt())
                    .build();
        }
    }

    /** 항목-카드 (= checklist_item). 브레드크럼용 feature/task 정보 포함. */
    @Getter
    @AllArgsConstructor
    @Builder
    public static class ItemCard {
        private String id;
        private String title;
        private boolean completed;
        private String sprintStage;   // null이면 백로그
        private Integer position;
        private LocalDate dueDate;
        private String featureId;
        private String featureTitle;
        private String featureColor;
        private String taskId;
        private String taskTitle;
        private AssigneeInfo assignee;
        private AssigneeInfo completedBy; // B안: 완료자 (담당자와 다르면 "대신 완료")

        public static ItemCard of(ChecklistItem c) {
            Task task = c.getTask();
            Feature feature = task != null ? task.getFeature() : null;
            SprintStage st = c.getSprintStage();
            return ItemCard.builder()
                    .id(c.getId())
                    .title(c.getTitle())
                    .completed(Boolean.TRUE.equals(c.getIsCompleted()))
                    .sprintStage(st != null ? st.name() : null)
                    .position(c.getPosition())
                    .dueDate(c.getDueDate())
                    .featureId(feature != null ? feature.getId() : null)
                    .featureTitle(feature != null ? feature.getTitle() : null)
                    .featureColor(feature != null ? feature.getColor() : null)
                    .taskId(task != null ? task.getId() : null)
                    .taskTitle(task != null ? task.getTitle() : null)
                    .assignee(c.getAssignee() != null ? AssigneeInfo.of(c.getAssignee()) : null)
                    .completedBy(c.getCompletedBy() != null ? AssigneeInfo.of(c.getCompletedBy()) : null)
                    .build();
        }
    }

    @Getter
    @AllArgsConstructor
    @Builder
    public static class AssigneeInfo {
        private String id;
        private String name;
        private String profileImage;

        public static AssigneeInfo of(User u) {
            return AssigneeInfo.builder()
                    .id(u.getId())
                    .name(u.getName())
                    .profileImage(u.getProfileImage())
                    .build();
        }
    }
}
