package com.kanban.domain.ranking.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 프로필 · 랭킹 · 리그 API. 계약서 §2 · §5 · §6 */
public class RankingDto {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Profile {
        private String nickname;
        private String tag;
        private boolean anonymous;
        private String anonName;
        private int leagueTier;
        private ChurchInfo church;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ChurchInfo {
        private String id;
        private String name;
        private String region;
        private String dept;
        private Instant changedAt;
        private Instant canChangeAt;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class UpdateProfile {
        /** null = 그대로, "" = 지우기 */
        private String nickname;
        /** null = 그대로 */
        private Boolean anonymous;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Entry {
        private Integer rank;
        private String name;
        private boolean anonymous;
        private String dept;
        /** books 는 ms. 기록이 없으면 null(생략) */
        private Integer value;

        private boolean me;
        /** 리그만: up / stay / down */
        private String zone;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Me {
        private Integer rank;
        private Integer value;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Board {
        private LocalDate week;
        private Instant endsAt;
        private String board;
        private String scope;
        private List<Entry> entries;
        private Me me;
        private Integer gapToNext;
        /** null(생략) | no_church | too_few */
        private String locked;
        /** too_few 일 때 교회 등록자 수 */
        private Integer members;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Ranks {
        private Integer global;
        private Integer church;
        private Integer league;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class League {
        private LocalDate week;
        private Instant endsAt;
        private int tier;
        private String tierName;
        private int promote;
        private int demote;
        private List<Entry> entries;
        private LastResult lastResult;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class LastResult {
        private LocalDate week;
        private int rank;
        private int tierFrom;
        private int tierTo;
        private String moved;
    }
}
