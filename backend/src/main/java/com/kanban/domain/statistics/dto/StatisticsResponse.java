package com.kanban.domain.statistics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

public class StatisticsResponse {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BoardStatistics {
        private Summary summary;
        private List<MemberStatistics> by_member;
        private List<FeatureStatistics> by_feature;
        private List<TagStatistics> by_tag;
        private ImpactStatistics impact;
        private List<DailyTrend> daily_trend;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Summary {
        private long total_work_minutes;
        private long completed_work_minutes;
        private long incomplete_work_minutes;
        private int total_tasks;
        private int completed_tasks;
        private int incomplete_tasks;
        private int total_features;
        private int completed_features;
        private double average_feature_progress;
        private double focus_rate;
        private String period_start;
        private String period_end;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MemberStatistics {
        private MemberInfo member;
        private long total_minutes;
        private long completed_minutes;
        private int task_count;
        private int completed_task_count;
        private double impact_score;
        private List<FeatureTime> by_feature;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MemberInfo {
        private String id;
        private String name;
        private String profile_image;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FeatureTime {
        private String feature_id;
        private String feature_title;
        private String feature_color;
        private long minutes;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FeatureStatistics {
        private FeatureInfo feature;
        private long total_minutes;
        private long completed_minutes;
        private int task_count;
        private int completed_task_count;
        private double progress_percentage;
        private List<MemberTime> by_member;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FeatureInfo {
        private String id;
        private String title;
        private String color;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MemberTime {
        private String member_id;
        private String member_name;
        private long minutes;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TagStatistics {
        private TagInfo tag;
        private long total_minutes;
        private int task_count;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TagInfo {
        private String id;
        private String name;
        private String color;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ImpactStatistics {
        private double total_impact_score;
        private List<MemberImpact> by_member;
        private List<WeightLevelStats> by_weight_level;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MemberImpact {
        private String member_id;
        private String member_name;
        private String profile_image;
        private double impact_score;
        private long weighted_minutes;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class WeightLevelStats {
        private WeightLevel level;
        private long total_minutes;
        private int task_count;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class WeightLevel {
        private String id;
        private String name;
        private double weight;
        private String color;
        private int position;
        private boolean is_default;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DailyTrend {
        private String date;
        private long total_minutes;
        private long completed_minutes;
        private int task_completed_count;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PersonalStatistics {
        private PersonalSummary summary;
        private List<PersonalFeatureTime> by_feature;
        private List<PersonalTagTime> by_tag;
        private List<TopTask> top_tasks;
        private List<PersonalDailyTrend> daily_trend;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PersonalSummary {
        private long total_work_minutes;
        private long completed_work_minutes;
        private int total_tasks;
        private int completed_tasks;
        private double impact_score;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PersonalFeatureTime {
        private String feature_id;
        private String feature_title;
        private String feature_color;
        private long minutes;
        private int task_count;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PersonalTagTime {
        private String tag_id;
        private String tag_name;
        private String tag_color;
        private long minutes;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TopTask {
        private String task_id;
        private String task_title;
        private String feature_title;
        private long minutes;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PersonalDailyTrend {
        private String date;
        private long minutes;
    }
}
