package com.kanban.domain.weight.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

public class WeightRequest {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateLevels {
        private List<LevelData> levels;
        private String default_level_id;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LevelData {
        private String id;
        private String name;
        private Double weight;
        private String color;
        private Integer position;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SetTaskWeight {
        private String weight_level_id;
    }
}
