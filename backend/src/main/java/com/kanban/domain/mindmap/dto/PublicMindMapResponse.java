package com.kanban.domain.mindmap.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 마인드맵 공개 스냅샷 (인증 불요).
 * 레이아웃(board_mindmaps.data) + 정제된 피처/태스크/마일스톤을 서버에서 합성해 한 번에 내려준다.
 * 공유 옵션으로 꺼진 데이터(담당자 등)는 필드 자체가 응답에서 빠진다 — 프론트 숨김 금지 원칙.
 */
@Getter
@Builder
@AllArgsConstructor
public class PublicMindMapResponse {

    private String boardName;
    /** 노드/엣지/펼침 상태 — 멤버용 마인드맵 조회와 동일 구조 (show_memos=false면 메모 노드·엣지 제거) */
    private MindMapResponse layout;
    private List<FeatureItem> features;
    /** show_tasks=false면 빈 배열 */
    private List<TaskItem> tasks;
    private List<MilestoneItem> milestones;
    private LocalDateTime generatedAt;

    @Getter
    @Builder
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class FeatureItem {
        private String id;
        private String title;
        private String color;
        private String status;
        private int totalTasks;
        private int completedTasks;
        private int progressPercentage;
        private int position;
        private List<MilestoneItem> milestones;
        /** show_assignees=false면 null → 응답에서 제거 */
        private AssigneeItem assignee;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class TaskItem {
        private String id;
        private String featureId;
        private String title;
        private boolean completed;
        private String milestoneId;
        private int position;
        private int featurePosition;
        /** show_assignees=false면 null → 응답에서 제거 */
        private List<AssigneeItem> assignees;
    }

    /** idx: 보드 마일스톤 목록(시작일 오름차순) 기준 0부터 부여 — 프론트 칩 색상 매핑용 */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class MilestoneItem {
        private String id;
        private String title;
        private int idx;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class AssigneeItem {
        private String id;
        private String name;
    }
}
