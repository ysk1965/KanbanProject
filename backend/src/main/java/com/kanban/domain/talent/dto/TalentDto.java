package com.kanban.domain.talent.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 챌린지 지갑 API. 계약서 §1 */
public class TalentDto {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Wallet {
        private int balance;
        private LocalDate week;
        private Instant weekEndsAt;
        private int weekTalents;
        private int todayGameTalents;
        private int gameDailyCap;
        private int streakWeeks;
        private int bestStreak;
        private WeekComplete weekComplete;
        private int rewardCredits;
        /** 리워드가 없으면 null(생략) */
        private Instant rewardExpiresAt;

        private int exchangedThisMonth;
        private int exchangeMonthlyCap;
        private int exchangeRate;
        private int personalCreditsAvailable;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class WeekComplete {
        private boolean note;
        private boolean applyDone;
        private boolean done;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class LedgerItem {
        private String id;
        private int amount;
        private String reason;
        private String label;
        private Instant createdAt;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class LedgerPage {
        private List<LedgerItem> items;
        /** 더 없으면 null(생략) */
        private Instant nextBefore;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class ExchangeRequest {
        private Integer credits;
    }
}
