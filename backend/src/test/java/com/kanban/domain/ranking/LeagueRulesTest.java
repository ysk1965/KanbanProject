package com.kanban.domain.ranking;

import static org.assertj.core.api.Assertions.assertThat;

import com.kanban.domain.ranking.service.LeagueRules;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("리그 승강 규칙")
class LeagueRulesTest {

    @Test
    @DisplayName("12명 이상은 위 7 · 아래 5, 그보다 적으면 비례(최소 1·0)")
    void counts() {
        assertThat(LeagueRules.promoteCount(30, 1)).isEqualTo(7);
        assertThat(LeagueRules.demoteCount(30, 1)).isEqualTo(5);
        assertThat(LeagueRules.promoteCount(6, 1)).isEqualTo(3);
        assertThat(LeagueRules.demoteCount(6, 1)).isEqualTo(2);
        assertThat(LeagueRules.promoteCount(1, 1)).isEqualTo(1);
        assertThat(LeagueRules.demoteCount(2, 1)).isZero();
        // 포도나무는 못 올라가고 겨자씨는 못 내려간다
        assertThat(LeagueRules.promoteCount(30, 4)).isZero();
        assertThat(LeagueRules.demoteCount(30, 0)).isZero();
    }

    @Test
    @DisplayName("0달란트는 순위와 무관하게 down(겨자씨 제외), up 은 달란트 > 0 만")
    void zones() {
        assertThat(LeagueRules.zone(1, 30, 100, 1)).isEqualTo("up");
        assertThat(LeagueRules.zone(7, 30, 1, 1)).isEqualTo("up");
        assertThat(LeagueRules.zone(8, 30, 50, 1)).isEqualTo("stay");
        assertThat(LeagueRules.zone(26, 30, 10, 1)).isEqualTo("down");
        assertThat(LeagueRules.zone(10, 30, 0, 1)).isEqualTo("down");
        assertThat(LeagueRules.zone(1, 30, 0, 1)).isEqualTo("down");
        assertThat(LeagueRules.zone(30, 30, 0, 0)).isEqualTo("stay");
        assertThat(LeagueRules.tierAfter("up", 4)).isEqualTo(4);
        assertThat(LeagueRules.tierAfter("down", 0)).isZero();
    }
}
