package com.kanban.domain.game;

import static org.assertj.core.api.Assertions.assertThat;

import com.kanban.domain.game.service.BooksRules;
import com.kanban.domain.game.service.RainScorer;
import com.kanban.domain.game.service.RainScorer.Event;
import com.kanban.domain.game.service.RainScorer.Word;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("게임 점수 재계산")
class RainScorerTest {

    /** 30개: 0~29 모두 3글자 일반, 5번 gold, 7번 galpi("갈피") */
    private static List<Word> words() {
        List<Word> w = new ArrayList<>();
        for (int i = 0; i < 30; i++) {
            if (i == 5) w.add(new Word("은혜다", "gold"));
            else if (i == 7) w.add(new Word("갈피", "galpi"));
            else w.add(new Word("사랑이", ""));
        }
        return w;
    }

    private static Event hit(int i, long t) {
        return new Event("hit", i, t);
    }

    @Test
    @DisplayName("hit 점수 = len×10×level×(gold 3) + min(combo,10)×5")
    void basicCombo() {
        // 3글자 일반: 30 + 5, 30 + 10, gold(i=5): 90 + 15
        RainScorer.Result r = RainScorer.score(words(), List.of(hit(0, 1000), hit(1, 2000), hit(5, 3000)), 10_000);
        assertThat(r.score()).isEqualTo(35 + 40 + 105);
        assertThat(r.valid()).isTrue();
    }

    @Test
    @DisplayName("miss · 일반 drop 은 combo 0, galpi drop 은 combo 유지")
    void comboReset() {
        List<Event> ev = List.of(
                hit(0, 1000), // 30+5
                new Event("miss", null, 1500),
                hit(1, 2000), // 30+5
                new Event("drop", 7, 2500), // galpi drop — combo 유지
                hit(2, 3000), // 30+10
                new Event("drop", 3, 3500), // 일반 drop — combo 0
                hit(4, 4000)); // 30+5
        assertThat(RainScorer.score(words(), ev, 10_000).score()).isEqualTo(35 + 35 + 40 + 35);
    }

    @Test
    @DisplayName("galpi hit 도 같은 식(2글자)")
    void galpiHit() {
        assertThat(RainScorer.score(words(), List.of(hit(7, 1000)), 5000).score())
                .isEqualTo(20 + 5);
    }

    @Test
    @DisplayName("10번째 hit 까지 level 1, 11번째부터 level 2, combo 보너스는 10에서 멈춤")
    void levelUp() {
        List<Event> ev = new ArrayList<>();
        int[] idx = {0, 1, 2, 3, 4, 6, 8, 9, 10, 11, 12, 13}; // gold·galpi 제외 12개
        for (int k = 0; k < idx.length; k++) ev.add(hit(idx[k], 1000L * (k + 1)));
        int expected = 0;
        for (int k = 1; k <= 12; k++) {
            int level = 1 + (k - 1) / 10;
            expected += 3 * 10 * level + Math.min(k, 10) * 5;
        }
        assertThat(RainScorer.score(words(), ev, 60_000).score()).isEqualTo(expected);
    }

    @Test
    @DisplayName("일반 drop 6번이면 끝 — 그 뒤 이벤트는 무시")
    void livesEnd() {
        List<Event> ev = new ArrayList<>();
        for (int k = 0; k < 6; k++) ev.add(new Event("drop", 10 + k, 1000L * (k + 1)));
        ev.add(hit(0, 9000));
        RainScorer.Result r = RainScorer.score(words(), ev, 10_000);
        assertThat(r.score()).isZero();
        assertThat(r.drops()).isEqualTo(6);
    }

    @Test
    @DisplayName("같은 i 두 번 hit · t 감소 · t > duration · duration > 상한 → valid=false")
    void structuralInvalid() {
        assertThat(RainScorer.score(words(), List.of(hit(0, 1000), hit(0, 2000)), 5000)
                        .valid())
                .isFalse();
        assertThat(RainScorer.score(words(), List.of(hit(0, 2000), hit(1, 1000)), 5000)
                        .valid())
                .isFalse();
        assertThat(RainScorer.score(words(), List.of(hit(0, 6000)), 5000).valid())
                .isFalse();
        assertThat(RainScorer.score(words(), List.of(hit(0, 1000)), 900_001).valid())
                .isFalse();
        // 두 번째 같은 hit 은 점수 없음
        assertThat(RainScorer.score(words(), List.of(hit(0, 1000), hit(0, 2000)), 5000)
                        .score())
                .isEqualTo(35);
    }

    @Test
    @DisplayName("연속 hit 간격 150ms 미만이 30% 넘으면 valid=false (점수는 계산)")
    void fastGaps() {
        // 간격 4개 중 2개 빠름(50%) → invalid
        List<Event> fast = List.of(hit(0, 1000), hit(1, 1100), hit(2, 2000), hit(3, 2050), hit(4, 3000));
        RainScorer.Result r = RainScorer.score(words(), fast, 5000);
        assertThat(r.valid()).isFalse();
        assertThat(r.score()).isPositive();
        // 간격 4개 중 1개 빠름(25%) → valid
        List<Event> ok = List.of(hit(0, 1000), hit(1, 1100), hit(2, 2000), hit(3, 3000), hit(4, 4000));
        assertThat(RainScorer.score(words(), ok, 5000).valid()).isTrue();
    }

    @Test
    @DisplayName("66권: 오름차순 연속 정답 + 카드 수 × 250ms 이상만 valid")
    void books() {
        List<Integer> pent = List.of(0, 1, 2, 3, 4);
        assertThat(BooksRules.isValid("pentateuch", pent, 1250)).isTrue();
        assertThat(BooksRules.isValid("pentateuch", pent, 1249)).isFalse();
        assertThat(BooksRules.isValid("pentateuch", List.of(0, 1, 3, 2, 4), 5000))
                .isFalse();
        assertThat(BooksRules.isValid("pentateuch", List.of(0, 1, 2, 3), 5000)).isFalse();
        assertThat(BooksRules.isValid("nt", IntStream.range(39, 66).boxed().toList(), 27 * 250))
                .isTrue();
        assertThat(BooksRules.cards("all")).hasSize(66);
        assertThat(BooksRules.cards("ot")).hasSize(39);
    }
}
