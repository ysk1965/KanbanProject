package com.kanban.domain.organization.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.util.List;

public class OrgBoardResourceResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BoardInfo {
        private String id;
        private String name;
        private String ownerName;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TopContributor {
        private String memberId;
        private String name;
        private String profileImage;
        private long workMinutes;
        private double percentage;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class WeeklyTrend {
        private LocalDate weekStart;
        private long workMinutes;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BoardResource {
        private BoardInfo board;
        private long totalWorkMinutes;
        private double orgSharePercentage;
        private int contributorCount;
        private long completedTasks;
        private double featureProgress;
        private List<TopContributor> topContributors;
        private List<WeeklyTrend> weeklyTrend;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BoardWeekMinutes {
        private String boardId;
        private String boardName;
        private long workMinutes;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class WeeklyBoardTrend {
        private LocalDate weekStart;
        private List<BoardWeekMinutes> boards;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ResourceDistribution {
        private long totalWorkMinutes;
        private List<WeeklyBoardTrend> weeklyTrend;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<BoardResource> boards;
        private ResourceDistribution resourceDistribution;

        public static ListResponse of(
                List<BoardResource> boards,
                long totalWorkMinutes,
                List<WeeklyBoardTrend> weeklyTrend
        ) {
            return ListResponse.builder()
                    .boards(boards)
                    .resourceDistribution(ResourceDistribution.builder()
                            .totalWorkMinutes(totalWorkMinutes)
                            .weeklyTrend(weeklyTrend)
                            .build())
                    .build();
        }
    }
}
