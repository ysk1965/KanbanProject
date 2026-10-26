package com.kanban.domain.game.service;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 말씀 산성비 점수 재계산 (계약서 §4 — 프런트도 같은 식으로 화면 점수를 그린다).
 *
 * <ul>
 *   <li>level = 1 + floor(앞서 맞힌 수 / 10) — 10번째 hit 까지 1단계, 11번째부터 2단계
 *   <li>hit 점수 = len(text) × 10 × level × (gold ? 3 : 1) + min(combo, 10) × 5 (combo 는 이 hit 포함 연속 수)
 *   <li>miss · galpi 아닌 drop → combo 0. galpi 아닌 drop 6번이면 끝(그 뒤 이벤트 무시)
 *   <li>규칙 위반(같은 i 두 번 hit, t 감소, t &gt; duration, duration &gt; 상한, 너무 빠른 hit 간격 30% 초과)은 valid=false 로 표시하고 점수는 그대로
 *       계산한다(두 번째 hit 은 점수 없음)
 * </ul>
 */
public final class RainScorer {

    public static final int LIVES = 6;
    public static final int LEVEL_EVERY = 10;
    public static final int MIN_GAP_MS = 150;
    public static final int MAX_DURATION_MS = 900_000;
    public static final double FAST_RATIO_LIMIT = 0.3;
    public static final int COMBO_MAX = 10;

    public static final String KIND_GOLD = "gold";
    public static final String KIND_GALPI = "galpi";

    public record Word(String text, String kind) {}

    /** type: hit / miss / drop. i 는 hit·drop 에서 단어 번호(이미 범위 검증됨) */
    public record Event(String type, Integer i, long t) {}

    public record Result(int score, boolean valid, int hits, int drops) {}

    private RainScorer() {}

    public static Result score(List<Word> words, List<Event> events, long durationMs) {
        boolean valid = durationMs >= 0 && durationMs <= MAX_DURATION_MS;
        int score = 0;
        int hits = 0;
        int combo = 0;
        int drops = 0;
        long prevT = Long.MIN_VALUE;
        Long lastHitT = null;
        int pairs = 0;
        int fastPairs = 0;
        Set<Integer> hitIdx = new HashSet<>();

        for (Event e : events) {
            if (e.t() < prevT || e.t() < 0 || e.t() > durationMs) valid = false;
            prevT = Math.max(prevT, e.t());
            switch (e.type()) {
                case "hit" -> {
                    if (!hitIdx.add(e.i())) {
                        valid = false;
                        continue;
                    }
                    Word w = words.get(e.i());
                    int level = 1 + hits / LEVEL_EVERY;
                    combo++;
                    int len = w.text().codePointCount(0, w.text().length());
                    score += len * 10 * level * (KIND_GOLD.equals(w.kind()) ? 3 : 1) + Math.min(combo, COMBO_MAX) * 5;
                    hits++;
                    if (lastHitT != null) {
                        pairs++;
                        if (e.t() - lastHitT < MIN_GAP_MS) fastPairs++;
                    }
                    lastHitT = e.t();
                }
                case "miss" -> combo = 0;
                case "drop" -> {
                    boolean galpi =
                            e.i() != null && KIND_GALPI.equals(words.get(e.i()).kind());
                    if (!galpi) {
                        combo = 0;
                        drops++;
                    }
                }
                default -> throw new IllegalArgumentException("unknown event type");
            }
            if (drops >= LIVES) break;
        }
        if (pairs > 0 && (double) fastPairs / pairs > FAST_RATIO_LIMIT) valid = false;
        return new Result(score, valid, hits, drops);
    }
}
