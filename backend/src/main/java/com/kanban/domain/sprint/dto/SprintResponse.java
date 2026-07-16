package com.kanban.domain.sprint.dto;

import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.contractor.entity.BoardContractor;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.sprint.Sprint;
import com.kanban.domain.sprint.SprintColumn;
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
        private List<Column> columns;          // 동적 컬럼 (START..MIDDLE..END), 각 컬럼에 담긴 카드 포함
        private List<ItemCard> backlog;        // 담기 후보 (아직 미담긴 마일스톤 항목)
        private List<JiraTask> jiraTasks;      // JIRA 뷰용 — 보드 전체 JIRA 연동 Task (스프린트 담김 무관). 미연동이면 빈 목록.
    }

    /**
     * JIRA 뷰(컬럼=JIRA 상태) 전용 카드. 스프린트 스코프가 아니라 "보드 스코프" — 스프린트에
     * 담기지 않은 이슈도 JIRA 보드처럼 그대로 비춘다(재동기화 import 카드가 바로 보이도록).
     * 카드 단위가 체크리스트가 아니라 Task(=JIRA 이슈 1건)이며, done/total은 그 Task의 체크리스트 진행도.
     */
    @Getter
    @AllArgsConstructor
    @Builder
    public static class JiraTask {
        private String taskId;
        private String taskTitle;
        private String jiraIssueKey;      // 연동 이슈 키 (항상 존재)
        private String qaState;           // REVIEW/VERIFIED/REJECTED, 없으면 null
        private String blockId;           // 현재 칸반 블록 = 미러 컬럼 배치 키
        private String jiraStatusId;      // 마지막 pull 시점의 JIRA 상태 id (매뉴얼 매핑 배치 키)
        private String featureId;         // 피쳐 칩 필터용
        private List<AssigneeInfo> assignees; // 체크리스트 담당자(중복 제거)
        private int done;                 // 완료 체크리스트 수
        private int total;                // 전체 체크리스트 수
    }

    /** 스프린트 보드 컬럼 (마일스톤 단위). kind: START | MIDDLE | END */
    @Getter
    @AllArgsConstructor
    @Builder
    public static class Column {
        private String id;
        private String name;
        private String kind;
        private int position;
        private String color;
        private List<ItemCard> items;

        public static Column of(SprintColumn c, List<ItemCard> items) {
            return Column.builder()
                    .id(c.getId())
                    .name(c.getName())
                    .kind(c.getKind().name())
                    .position(c.getPosition())
                    .color(c.getColor())
                    .items(items)
                    .build();
        }
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
        private String sprintColumnId;   // null이면 백로그
        private Integer position;
        private LocalDate dueDate;
        private LocalDate startDate;      // 진행 현황 4구간 분류용(진행 중 판정)
        private LocalDate doneDate;       // 완료일(과거 데이터 폴백, day 단위)
        private LocalDateTime completedAt; // 완료 시각(오늘 완료 판정 소스)
        private String featureId;
        private String featureTitle;
        private String featureColor;
        private LocalDateTime featureCreatedAt; // Feature 생성 순서 정렬용
        private String taskId;
        private String taskTitle;
        private AssigneeInfo assignee;
        private ContractorInfo contractor; // 외주 담당(있으면). 내부 assignee와 배타적으로 채워진다.
        private AssigneeInfo completedBy; // B안: 완료자 (담당자와 다르면 "대신 완료")
        // ── JIRA 뷰 전용 (컬럼=JIRA 상태 그루핑용) ──
        private String blockId;           // 부모 Task의 현재 칸반 블록 = 매핑된 JIRA 상태(push 시 최신)
        private String qaState;           // JIRA pull QA 상태 (REVIEW/VERIFIED/REJECTED), 없으면 null
        private String jiraIssueKey;      // 연동된 JIRA 이슈 키(QASA-123), 미연동이면 null
        private String jiraStatusId;      // 마지막 pull 시점의 실제 JIRA 상태 id (미러링 컬럼 배치용)

        public static ItemCard of(ChecklistItem c) {
            return of(c, null, null);
        }

        /** JIRA 뷰용 — 부모 Task의 JIRA 이슈 키 + 실제 JIRA 상태 id를 함께 주입. */
        public static ItemCard of(ChecklistItem c, String jiraIssueKey, String jiraStatusId) {
            Task task = c.getTask();
            Feature feature = task != null ? task.getFeature() : null;
            SprintColumn col = c.getSprintColumn();
            return ItemCard.builder()
                    .id(c.getId())
                    .title(c.getTitle())
                    .completed(Boolean.TRUE.equals(c.getIsCompleted()))
                    .sprintColumnId(col != null ? col.getId() : null)
                    .position(c.getPosition())
                    .dueDate(c.getDueDate())
                    .startDate(c.getStartDate())
                    .doneDate(c.getDoneDate())
                    .completedAt(c.getCompletedAt())
                    .featureId(feature != null ? feature.getId() : null)
                    .featureTitle(feature != null ? feature.getTitle() : null)
                    .featureColor(feature != null ? feature.getColor() : null)
                    .featureCreatedAt(feature != null ? feature.getCreatedAt() : null)
                    .taskId(task != null ? task.getId() : null)
                    .taskTitle(task != null ? task.getTitle() : null)
                    .assignee(c.getAssignee() != null ? AssigneeInfo.of(c.getAssignee()) : null)
                    .contractor(c.getContractor() != null ? ContractorInfo.of(c.getContractor()) : null)
                    .completedBy(c.getCompletedBy() != null ? AssigneeInfo.of(c.getCompletedBy()) : null)
                    .blockId(task != null && task.getBlock() != null ? task.getBlock().getId() : null)
                    .qaState(task != null && task.getQaState() != null ? task.getQaState().name() : null)
                    .jiraIssueKey(jiraIssueKey)
                    .jiraStatusId(jiraStatusId)
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

    /**
     * 외주(BoardContractor) 담당 정보. 구성원 뷰에서 이 카드를 "관리 담당(내부 멤버)"의 컬럼으로
     * 라우팅하기 위해 managerUserId(관리자의 user id)를 함께 내려준다. 관리자 미지정이면 null → 미배정 폴백.
     */
    @Getter
    @AllArgsConstructor
    @Builder
    public static class ContractorInfo {
        private String id;
        private String name;
        private String color;
        private String managerUserId; // 관리 담당 내부 멤버의 user id (구성원 뷰 컬럼 라우팅 키)
        private String managerName;

        public static ContractorInfo of(BoardContractor c) {
            String managerUserId = null;
            String managerName = null;
            if (c.getManager() != null && c.getManager().getUser() != null) {
                managerUserId = c.getManager().getUser().getId();
                managerName = c.getManager().getUser().getName();
            }
            return ContractorInfo.builder()
                    .id(c.getId())
                    .name(c.getName())
                    .color(c.getColor())
                    .managerUserId(managerUserId)
                    .managerName(managerName)
                    .build();
        }
    }
}
