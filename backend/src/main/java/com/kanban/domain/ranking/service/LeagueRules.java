package com.kanban.domain.ranking.service;

import com.kanban.domain.ranking.LeagueResult;
import com.kanban.domain.ranking.RankingProfile;
import java.util.List;

/** 주간 리그 규칙 (순수 계산) */
public final class LeagueRules {

    public static final int COHORT_SIZE = 30;
    public static final int PROMOTE = 7;
    public static final int DEMOTE = 5;
    /** 이보다 적으면 promote/demote 를 비례로 줄인다 */
    public static final int FULL_SIZE = 12;

    public static final List<String> TIER_NAMES = List.of("겨자씨", "새싹", "가지", "열매", "포도나무");

    private LeagueRules() {}

    public static String tierName(int tier) {
        return TIER_NAMES.get(Math.max(0, Math.min(TIER_NAMES.size() - 1, tier)));
    }

    /** 위로 올라가는 자리 수 (포도나무는 0, 최소 1) */
    public static int promoteCount(int size, int tier) {
        if (size <= 0 || tier >= RankingProfile.TIER_MAX) return 0;
        if (size >= FULL_SIZE) return PROMOTE;
        return Math.max(1, PROMOTE * size / FULL_SIZE);
    }

    /** 아래로 내려가는 자리 수 (겨자씨는 0, 최소 0) */
    public static int demoteCount(int size, int tier) {
        if (size <= 0 || tier <= RankingProfile.TIER_MIN) return 0;
        if (size >= FULL_SIZE) return DEMOTE;
        return DEMOTE * size / FULL_SIZE;
    }

    /**
     * position 은 1부터, 동점은 먼저 들어온 순으로 이미 정렬된 자리. 위 promote 자리(달란트 &gt; 0)는 up, 아래 demote 자리와 0달란트는
     * down(겨자씨 제외), 나머지 stay.
     */
    public static String zone(int position, int size, int talents, int tier) {
        if (position <= promoteCount(size, tier) && talents > 0) return LeagueResult.UP;
        if (tier > RankingProfile.TIER_MIN && (talents <= 0 || position > size - demoteCount(size, tier))) {
            return LeagueResult.DOWN;
        }
        return LeagueResult.STAY;
    }

    public static int tierAfter(String zone, int tier) {
        if (LeagueResult.UP.equals(zone)) return Math.min(RankingProfile.TIER_MAX, tier + 1);
        if (LeagueResult.DOWN.equals(zone)) return Math.max(RankingProfile.TIER_MIN, tier - 1);
        return tier;
    }
}
