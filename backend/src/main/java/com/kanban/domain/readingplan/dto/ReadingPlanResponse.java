package com.kanban.domain.readingplan.dto;

import java.time.LocalDate;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

/** 통독 API 응답. Jackson SNAKE_CASE + non_null — null 필드는 키가 빠진다(group_name, today_day_no, today …). */
public class ReadingPlanResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Mine {
        private List<PlanSummary> plans;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class PlanSummary {
        private String id;
        private String title;
        private String template;
        private String groupId;
        private String groupName;
        private LocalDate startDate;
        private LocalDate endDate;
        private int totalDays;
        private Integer todayDayNo;
        private int myDoneDays;
        private int behindDays;
        private List<Due> due;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Due {
        private int dayNo;
        private LocalDate date;
        private String chapter;
    }

    /** GET /group/{groupId} — active 길 없으면 plan 키 없이 {} */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class GroupPlan {
        private PlanDetail plan;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class PlanDetail {
        private String id;
        private String title;
        private String template;
        private String status;
        private String groupId;
        private String groupName;
        private String ownerUserId;
        private LocalDate startDate;
        private LocalDate endDate;
        private int totalDays;
        private Integer todayDayNo;
        private boolean canManage;
        private List<Day> days;
        private long memberCount;
        private long teamDone;
        private long teamTotal;
        /** today_day_no 가 있을 때만 */
        private Today today;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Day {
        private int dayNo;
        private LocalDate date;
        private List<String> chapters;
        private int doneCount;
        private List<String> myChapters;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Today {
        private List<Person> read;
        private List<Person> unread;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Person {
        private String userId;
        private String displayName;
        private String profileImage;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Stamped {
        private List<Stamp> stamped;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Stamp {
        private String planId;
        private String title;
        private String groupName;
        private int dayNo;
        private boolean dayDone;
    }
}
