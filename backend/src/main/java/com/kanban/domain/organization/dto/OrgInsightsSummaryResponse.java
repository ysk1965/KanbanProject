package com.kanban.domain.organization.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;

public class OrgInsightsSummaryResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Period {
        private LocalDate startDate;
        private LocalDate endDate;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Summary {
        private Period period;
        private long totalWorkMinutes;
        private long previousTotalWorkMinutes;
        private double changePercentage;
        private int activeMembers;
        private int totalMembers;
        private long completedTasks;
        private long activeBoards;
        private int totalBoards;

        public static Summary of(
                LocalDate startDate,
                LocalDate endDate,
                long totalWorkMinutes,
                long previousTotalWorkMinutes,
                int activeMembers,
                int totalMembers,
                long completedTasks,
                long activeBoards,
                int totalBoards
        ) {
            double changePercentage = 0.0;
            if (previousTotalWorkMinutes > 0) {
                changePercentage = ((double) (totalWorkMinutes - previousTotalWorkMinutes) / previousTotalWorkMinutes) * 100.0;
            }

            return Summary.builder()
                    .period(Period.builder()
                            .startDate(startDate)
                            .endDate(endDate)
                            .build())
                    .totalWorkMinutes(totalWorkMinutes)
                    .previousTotalWorkMinutes(previousTotalWorkMinutes)
                    .changePercentage(changePercentage)
                    .activeMembers(activeMembers)
                    .totalMembers(totalMembers)
                    .completedTasks(completedTasks)
                    .activeBoards(activeBoards)
                    .totalBoards(totalBoards)
                    .build();
        }
    }
}
