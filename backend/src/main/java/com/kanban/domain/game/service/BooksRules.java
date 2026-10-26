package com.kanban.domain.game.service;

import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

/** 66권 줄 세우기 단계 · 검증 · 달란트. bookIndex 0=창세기 … 65=요한계시록 */
public final class BooksRules {

    public static final String STAGE_ALL = "all";
    public static final int MIN_MS_PER_CARD = 250;

    /** 단계 → [from, to) */
    public static final Map<String, int[]> STAGES = Map.of(
            "pentateuch", new int[] {0, 5}, "ot", new int[] {0, 39}, "nt", new int[] {39, 66}, STAGE_ALL, new int[] {
                0, 66
            });

    public static final Map<String, Integer> TALENTS = Map.of("pentateuch", 3, "nt", 8, "ot", 10, STAGE_ALL, 15);

    private BooksRules() {}

    public static List<Integer> cards(String stage) {
        int[] r = STAGES.get(stage);
        return IntStream.range(r[0], r[1]).boxed().toList();
    }

    /** 정답(오름차순 연속, 그 단계 카드 전부) + 카드 수 × 250ms 이상 */
    public static boolean isValid(String stage, List<Integer> order, long durationMs) {
        List<Integer> expected = cards(stage);
        return expected.equals(order) && durationMs >= (long) expected.size() * MIN_MS_PER_CARD;
    }
}
