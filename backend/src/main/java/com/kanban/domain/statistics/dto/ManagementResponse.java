package com.kanban.domain.statistics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

public class ManagementResponse {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ManagementStatistics {
        private List<MilestoneHealth> milestone_health;
        private List<MemberProductivity> team_productivity;
        private DelayedItems delayed_items;
        private ManagementSummary summary;
        private ManagementSettings settings;
    }

    // ==================== Milestone Health ====================

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MilestoneHealth {
        private MilestoneInfo milestone;
        private double progress_percentage;
        private String estimated_completion_date; // ISO date or null
        private String status; // ON_TRACK, SLOW, AT_RISK, OVERDUE
        private int days_remaining;
        private int days_overdue; // positive if overdue
        private VelocityInfo velocity;
        private List<BurndownPoint> burndown;
        private FeatureSummary feature_summary;
        private List<MilestoneTask> tasks; // 마일스톤 내 Task 목록
        private AllocationSummary allocation_summary; // 인원 할당 요약
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MilestoneInfo {
        private String id;
        private String title;
        private String description;
        private String start_date;
        private String end_date;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class VelocityInfo {
        private double average_tasks_per_day; // 최근 7일 평균
        private int tasks_remaining;
        private int tasks_completed;
        private int tasks_total;
        private double required_velocity; // 마감 내 완료하려면 필요한 속도
        // 시간 기반 메트릭
        private Integer estimated_total_minutes; // Task 예상 시간 총합
        private Integer actual_total_minutes; // ScheduleBlock 실제 시간 총합
        private Integer remaining_estimated_minutes; // 남은 Task 예상 시간 총합
        private Double average_minutes_per_day; // 최근 7일 평균 작업 시간 (분/일)
        private Double required_minutes_per_day; // 마감 내 완료하려면 필요한 시간 (분/일)
        private Double time_efficiency; // 실제시간/예상시간 * 100 (100보다 낮으면 예상보다 빠름)
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BurndownPoint {
        private String date; // ISO date
        private double ideal_remaining; // 이상적 남은 Task 수
        private int actual_remaining; // 실제 남은 Task 수
        // 시간 기반 번다운 (분 단위)
        private Double ideal_remaining_minutes; // 이상적 남은 시간 (분)
        private Integer actual_remaining_minutes; // 실제 남은 예상 시간 (분)
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FeatureSummary {
        private int total_features;
        private int completed_features;
        private int at_risk_features; // 마감 초과 또는 진행률 낮은 Feature
    }

    /**
     * 마일스톤 내 Task 정보 (예상 시간 설정용)
     * 담당자는 Task 자체가 아닌 ChecklistItem들의 담당자를 수집
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MilestoneTask {
        private String task_id;
        private String task_title;
        private String feature_id;
        private String feature_title;
        private String feature_color;
        private List<MemberInfo> assignees; // ChecklistItem 담당자들 (중복 제거)
        private String current_block;
        private boolean is_completed;
        private Integer estimated_minutes; // null이면 미설정
        private Integer actual_minutes; // 실제 소요 시간
        private String start_date;
        private String due_date;
    }

    // ==================== Team Productivity ====================

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MemberProductivity {
        private MemberInfo member;
        private int assigned_tasks;
        private int completed_tasks;
        private int in_progress_tasks;
        private double completion_rate; // percentage
        private int total_checklists;
        private int completed_checklists;
        private double checklist_completion_rate; // percentage
        private String status; // NORMAL, NEEDS_ATTENTION, COMPLETED
        private List<InProgressTask> in_progress_task_details;
        private List<StuckChecklistItem> stuck_checklists;
        private List<RecentCompletedTask> recent_completed_tasks;
        // 시간 기반 메트릭
        private Integer total_estimated_minutes; // 담당 Task 예상 시간 총합
        private Integer total_actual_minutes; // 실제 작업 시간 총합
        private Double time_efficiency; // 실제/예상 * 100
        private Double average_minutes_per_day; // 최근 7일 평균 작업 시간
        // 새로운 필드: 담당자 기준 (ChecklistItem assignee 기준)
        private List<InProgressTask> assigned_task_details; // ChecklistItem 담당자 기준 모든 Task
        private List<MemberChecklistInfo> all_checklist_details; // 모든 체크리스트
        private List<MemberChecklistInfo> in_progress_checklist_details; // 진행 중 체크리스트
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MemberInfo {
        private String id;
        private String name;
        private String profile_image;
        private String role;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class InProgressTask {
        private String task_id;
        private String task_title;
        private String feature_id;
        private String feature_title;
        private String feature_color;
        private String current_block;
        private int days_in_progress;
        private String start_date;
        private String due_date;
        private int checklist_total;
        private int checklist_completed;
        // 시간 기반 메트릭
        private Integer estimated_minutes; // 예상 시간
        private Integer actual_minutes; // 실제 소요 시간
        private Double time_efficiency; // 실제/예상 * 100
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StuckChecklistItem {
        private String checklist_id;
        private String checklist_title;
        private String task_id;
        private String task_title;
        private String feature_title;
        private int days_stuck;
        private String created_at;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RecentCompletedTask {
        private String task_id;
        private String task_title;
        private String feature_title;
        private String completed_at;
        private int days_to_complete; // 시작부터 완료까지 소요일
    }

    /**
     * 멤버의 체크리스트 정보 (모든 체크리스트 / 진행 중 체크리스트 표시용)
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MemberChecklistInfo {
        private String checklist_id;
        private String checklist_title;
        private String task_id;
        private String task_title;
        private String feature_id;
        private String feature_title;
        private String feature_color;
        private boolean is_completed;
        private String created_at;
        private String completed_at;
    }

    // ==================== Delayed Items ====================

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DelayedItems {
        private List<OverdueFeature> overdue_features;
        private List<StagnantTask> stagnant_tasks;
        private List<StuckChecklist> stuck_checklists;
        private BottleneckSummary bottleneck_summary;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OverdueFeature {
        private String feature_id;
        private String feature_title;
        private String feature_color;
        private String due_date;
        private int days_overdue;
        private MemberInfo assignee;
        private double progress_percentage;
        private int tasks_remaining;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StagnantTask {
        private String task_id;
        private String task_title;
        private String feature_id;
        private String feature_title;
        private String feature_color;
        private String current_block;
        private String block_name;
        private int days_in_block;
        private MemberInfo assignee;
        private String due_date;
        private boolean is_overdue;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StuckChecklist {
        private String checklist_id;
        private String checklist_title;
        private String task_id;
        private String task_title;
        private String feature_id;
        private String feature_title;
        private String feature_color;
        private int days_stuck;
        private MemberInfo assignee;
        private String due_date;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BottleneckSummary {
        private MemberBottleneck most_delayed_member;
        private BlockBottleneck most_problematic_block;
        private int total_overdue_features;
        private int total_stagnant_tasks;
        private int total_stuck_checklists;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MemberBottleneck {
        private MemberInfo member;
        private int delayed_item_count;
        private int overdue_tasks;
        private int stuck_checklists;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BlockBottleneck {
        private String block_id;
        private String block_name;
        private int stuck_task_count;
        private double average_days_stuck;
    }

    // ==================== Summary & Settings ====================

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ManagementSummary {
        private int total_milestones;
        private int on_track_milestones;
        private int at_risk_milestones;
        private int overdue_milestones;
        private int total_members;
        private int members_on_track;
        private int members_needing_attention;
        private int total_delayed_items;
        private double overall_health_score; // 0-100
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ManagementSettings {
        private int stagnant_task_days_threshold;
        private int stuck_checklist_days_threshold;
    }

    // ==================== Allocation Summary ====================

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AllocationSummary {
        private int total_allocated_members;
        private Double total_allocated_hours;
        private Double total_actual_hours;
        private Double utilization_rate;
        private Double default_hours_per_day;
        private List<AllocationMemberInfo> allocations;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AllocationMemberInfo {
        private String id;
        private MemberInfo member;
        private Integer working_days;
        private Double allocated_hours;
        private Double actual_hours;
        private Double difference;
        private String status; // OVER, UNDER, NORMAL
    }
}
