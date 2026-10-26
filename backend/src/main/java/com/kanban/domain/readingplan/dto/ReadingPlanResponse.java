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
        /** 오늘 날의 장 전부 + 내가 찍었는지 — today_day_no 가 있을 때만 */
        private List<TodayChapter> todayChapters;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TodayChapter {
        private String chapter;
        private boolean done;
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
        /** 사람별 줄 — 모임 active 멤버(가입순, 나의 길 = 주인 한 명). days[].readers/late 는 이 목록의 번호 */
        private List<Member> members;
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
        /** 그날 장을 모두 찍은 멤버 번호(members 순서). 없으면 키 생략 */
        private List<Integer> readers;
        /** readers 중 그날보다 이틀 이상 늦게 마저 찍은 멤버 번호. 없으면 키 생략 */
        private List<Integer> late;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Member {
        private String userId;
        private String displayName;
        private String profileImage;
        /** 다 읽은 날 수 */
        private int doneDays;
        /** 보는 사람 본인일 때만 true (아니면 키 생략) */
        private Boolean me;
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
