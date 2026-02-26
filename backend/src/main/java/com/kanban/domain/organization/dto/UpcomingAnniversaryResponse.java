package com.kanban.domain.organization.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.util.List;

public class UpcomingAnniversaryResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class AnniversaryItem {
        private String memberId;
        private String memberName;
        private String profileImageUrl;
        private String departmentName;
        private String type;
        private LocalDate date;
        private Integer years;
        private long messageCount;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<AnniversaryItem> today;
        private List<AnniversaryItem> thisWeek;
        private List<AnniversaryItem> thisMonth;
    }
}
