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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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
        private List<FeatureInfo> sprintFeatures; // 활성 스프린트에 담긴 피쳐 (태스크 0개인 빈 피쳐 포함)
        private List<FeatureInfo> boardFeatures;  // 보드의 담기 후보 피쳐 전체 (인박스 제외) — 빈 피쳐도 담을 수 있게 내려준다
        private List<JiraTask> jiraTasks;      // JIRA 뷰용 — 보드 전체 JIRA 연동 Task (스프린트 담김 무관). 미연동이면 빈 목록.
        private LocalDateTime jiraLastSeenAt;  // 이 사용자가 JIRA 뷰를 마지막으로 확인한 시각. 이보다 나중 linkedAt = 신규.
    }

    /** 피쳐 담기 단위 정보 — 담긴 피쳐 목록(sprint_features)과 담기 후보(board_features)에 공통 사용 */
    @Getter
    @AllArgsConstructor
    @Builder
    public static class FeatureInfo {
        private String id;
        private String title;
        private String color;
        private String status;            // ACTIVE | COMPLETED
        private LocalDateTime createdAt;  // 생성 순서 정렬용

        public static FeatureInfo of(Feature f) {
            return FeatureInfo.builder()
                    .id(f.getId())
                    .title(f.getTitle())
                    .color(f.getColor())
                    .status(f.getStatus() != null ? f.getStatus().name() : null)
                    .createdAt(f.getCreatedAt())
                    .build();
        }
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
        /**
         * 이 이슈가 <b>BRIDGE 보드에 링크된</b> 시각(jira_issue_links.created_at).
         * JIRA 원본 생성일이 아니라 "우리 보드에 들어온 시각" — 신규 뱃지 판정 기준.
         * (last_imported_at은 재동기화마다 갱신, jira_updated_at은 코멘트에도 반응해 부적합)
         */
        private LocalDateTime linkedAt;
        /** JIRA에서 원본 이슈가 삭제되어 연동이 끊긴 카드 — FE가 "JIRA 삭제됨" 뱃지로 표시. */
        private boolean jiraDeleted;
        /** JIRA 이슈 타입 이름("버그"/"Story"…). 이름 집합이 프로젝트마다 달라 FE가 표식으로 해석한다. */
        private String jiraIssueType;
        /** JIRA 우선순위 이름("Highest"/"높음"…). FE가 순위 표식으로 해석하고, 모르는 이름은 그대로 보인다. */
        private String jiraPriority;
        /**
         * JIRA {@code fields.updated} — "이 이슈가 JIRA에서 마지막으로 움직인 시각".
         * {@link #linkedAt}(우리 보드에 들어온 시각)과 다른 축이라 둘 다 내려보낸다.
         */
        private LocalDateTime jiraUpdatedAt;
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

    /**
     * 스프린트 카드 = <b>태스크</b> 1건. 담기/컬럼 이동의 단위이자 게이지의 분모다.
     *
     * <p>체크리스트는 카드 안쪽에 진척(done/total)과 항목 목록으로 붙는다. 태스크가 스프린트에
     * 담긴 뒤 체크리스트가 추가돼도 별도 조작 없이 여기 집계에 자연스럽게 반영된다.
     *
     * <p>DTO 이름은 프론트 호환을 위해 ItemCard를 유지한다(JSON 필드 구조는 동일 스키마).
     */
    @Getter
    @AllArgsConstructor
    @Builder
    public static class ItemCard {
        private String id;                // = taskId
        private String title;             // = taskTitle
        private boolean completed;        // 스프린트 상의 완료 = END(Done) 컬럼 도달
        private String sprintColumnId;    // null이면 백로그(미담김)
        private Integer position;
        private LocalDate dueDate;
        private LocalDate startDate;      // 진행 현황 4구간 분류용(진행 중 판정)
        private LocalDate doneDate;       // 완료일(day 단위)
        private LocalDateTime completedAt; // END 컬럼 도달 시각(오늘 완료 판정 소스)
        private Integer carryOverCount;   // 이월 횟수 — 0이면 이번 스프린트에서 처음 잡힌 태스크
        private String featureId;
        private String featureTitle;
        private String featureColor;
        private LocalDateTime featureCreatedAt; // Feature 생성 순서 정렬용
        private String taskId;
        private String taskTitle;
        private String taskKey;           // 사람이 읽는 키 (STORY-42)
        private AssigneeInfo assignee;    // 대표 담당자 (체크리스트 담당자 중 첫 번째)
        private ContractorInfo contractor; // 대표 외주 담당(있으면)
        private List<AssigneeInfo> assignees;   // 체크리스트 담당자 전체(중복 제거) — 구성원 뷰 라우팅 키
        private List<ContractorInfo> contractors; // 체크리스트 외주 담당 전체(중복 제거)
        // ── 체크리스트 롤업 (카드 안쪽 표시용) ──
        private int checklistDone;
        private int checklistTotal;
        private List<ChecklistLine> checklistItems;
        // ── JIRA 뷰 전용 (컬럼=JIRA 상태 그루핑용) ──
        private String blockId;           // 현재 칸반 블록 = 매핑된 JIRA 상태(push 시 최신)
        private String qaState;           // JIRA pull QA 상태 (REVIEW/VERIFIED/REJECTED), 없으면 null
        private String jiraIssueKey;      // 연동된 JIRA 이슈 키(QASA-123), 미연동이면 null
        private String jiraStatusId;      // 마지막 pull 시점의 실제 JIRA 상태 id (미러링 컬럼 배치용)

        public static ItemCard of(Task task, List<ChecklistItem> checklists) {
            return of(task, checklists, null, null);
        }

        /** JIRA 뷰용 — JIRA 이슈 키 + 실제 JIRA 상태 id를 함께 주입. */
        public static ItemCard of(Task task, List<ChecklistItem> checklists,
                                  String jiraIssueKey, String jiraStatusId) {
            Feature feature = task.getFeature();
            SprintColumn col = task.getSprintColumn();

            List<ChecklistLine> lines = new ArrayList<>();
            Map<String, AssigneeInfo> assignees = new LinkedHashMap<>();
            Map<String, ContractorInfo> contractors = new LinkedHashMap<>();
            int done = 0;
            for (ChecklistItem c : checklists) {
                if (Boolean.TRUE.equals(c.getIsCompleted())) {
                    done++;
                }
                lines.add(ChecklistLine.of(c));
                if (c.getAssignee() != null) {
                    assignees.putIfAbsent(c.getAssignee().getId(), AssigneeInfo.of(c.getAssignee()));
                }
                if (c.getContractor() != null) {
                    contractors.putIfAbsent(c.getContractor().getId(), ContractorInfo.of(c.getContractor()));
                }
            }
            List<AssigneeInfo> assigneeList = new ArrayList<>(assignees.values());
            List<ContractorInfo> contractorList = new ArrayList<>(contractors.values());
            LocalDateTime sprintDoneAt = task.getSprintDoneAt();

            return ItemCard.builder()
                    .id(task.getId())
                    .title(task.getTitle())
                    .completed(task.isSprintDone())
                    .sprintColumnId(col != null ? col.getId() : null)
                    .position(task.getPosition())
                    .dueDate(task.getDueDate())
                    .startDate(task.getStartDate())
                    .doneDate(sprintDoneAt != null ? sprintDoneAt.toLocalDate() : null)
                    .completedAt(sprintDoneAt)
                    .carryOverCount(task.getCarryOverCount())
                    .featureId(feature != null ? feature.getId() : null)
                    .featureTitle(feature != null ? feature.getTitle() : null)
                    .featureColor(feature != null ? feature.getColor() : null)
                    .featureCreatedAt(feature != null ? feature.getCreatedAt() : null)
                    .taskId(task.getId())
                    .taskTitle(task.getTitle())
                    .taskKey(task.getTaskKey())
                    .assignee(assigneeList.isEmpty() ? null : assigneeList.get(0))
                    .contractor(contractorList.isEmpty() ? null : contractorList.get(0))
                    .assignees(assigneeList)
                    .contractors(contractorList)
                    .checklistDone(done)
                    .checklistTotal(checklists.size())
                    .checklistItems(lines)
                    .blockId(task.getBlock() != null ? task.getBlock().getId() : null)
                    .qaState(task.getQaState() != null ? task.getQaState().name() : null)
                    .jiraIssueKey(jiraIssueKey)
                    .jiraStatusId(jiraStatusId)
                    .build();
        }
    }

    /** 카드 안쪽에 나열되는 체크리스트 한 줄. 담기 대상이 아니라 표시·토글 대상이다. */
    @Getter
    @AllArgsConstructor
    @Builder
    public static class ChecklistLine {
        private String id;
        private String title;
        private boolean completed;
        private Integer position;
        private LocalDate dueDate;
        private AssigneeInfo assignee;
        private ContractorInfo contractor;

        public static ChecklistLine of(ChecklistItem c) {
            return ChecklistLine.builder()
                    .id(c.getId())
                    .title(c.getTitle())
                    .completed(Boolean.TRUE.equals(c.getIsCompleted()))
                    .position(c.getPosition())
                    .dueDate(c.getDueDate())
                    .assignee(c.getAssignee() != null ? AssigneeInfo.of(c.getAssignee()) : null)
                    .contractor(c.getContractor() != null ? ContractorInfo.of(c.getContractor()) : null)
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
