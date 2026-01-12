package com.kanban.domain.weight.dto;

import com.kanban.domain.weight.TaskWeight;
import com.kanban.domain.weight.WeightLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.stream.Collectors;

public class WeightResponse {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BoardWeightSettings {
        private String board_id;
        private List<WeightLevelDetail> levels;
        private String default_level_id;

        public static BoardWeightSettings from(String boardId, List<WeightLevel> levels, String defaultLevelId) {
            return BoardWeightSettings.builder()
                    .board_id(boardId)
                    .levels(levels.stream()
                            .map(WeightLevelDetail::from)
                            .collect(Collectors.toList()))
                    .default_level_id(defaultLevelId)
                    .build();
        }
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class WeightLevelDetail {
        private String id;
        private String name;
        private Double weight;
        private String color;
        private Integer position;
        private Boolean is_default;

        public static WeightLevelDetail from(WeightLevel level) {
            return WeightLevelDetail.builder()
                    .id(level.getId())
                    .name(level.getName())
                    .weight(level.getWeight())
                    .color(level.getColor())
                    .position(level.getPosition())
                    .is_default(level.getIsDefault())
                    .build();
        }
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TaskWeightDetail {
        private String task_id;
        private String weight_level_id;
        private String weight_level_name;
        private Double weight;
        private String color;

        public static TaskWeightDetail from(TaskWeight taskWeight) {
            WeightLevel level = taskWeight.getWeightLevel();
            return TaskWeightDetail.builder()
                    .task_id(taskWeight.getTask().getId())
                    .weight_level_id(level.getId())
                    .weight_level_name(level.getName())
                    .weight(level.getWeight())
                    .color(level.getColor())
                    .build();
        }

        public static TaskWeightDetail defaultFor(String taskId) {
            return TaskWeightDetail.builder()
                    .task_id(taskId)
                    .weight_level_id(null)
                    .weight_level_name("Standard")
                    .weight(1.0)
                    .color("#6366f1")
                    .build();
        }
    }
}
