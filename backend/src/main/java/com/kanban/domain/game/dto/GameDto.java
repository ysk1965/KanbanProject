package com.kanban.domain.game.dto;

import com.kanban.domain.ranking.dto.RankingDto;
import java.util.List;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 게임 API. 계약서 §4 */
public class GameDto {

    @Getter
    @Setter
    @NoArgsConstructor
    public static class RainStart {
        private String set;
        private String label;
        private List<String> pool;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class RainRun {
        private String runId;
        private long seed;
        private List<Map<String, Object>> words;
        private Map<String, Object> rules;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class RainFinish {
        private Long durationMs;
        private List<RainEvent> events;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class RainEvent {
        private String type;
        private Integer i;
        private Long t;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class RainResult {
        private int score;
        private boolean valid;
        private int talents;
        private boolean talentsCapped;
        private Integer best;
        private Boolean isBest;
        private RankingDto.Ranks ranks;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class BooksStart {
        private String stage;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BooksRun {
        private String runId;
        private String stage;
        private List<Integer> cards;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class BooksFinish {
        private List<Integer> order;
        private Long durationMs;
        private Integer moves;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BooksResult {
        private long timeMs;
        private boolean valid;
        private int talents;
        private boolean talentsCapped;
        private Integer bestMs;
        private Boolean isBest;
        private RankingDto.Ranks ranks;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Best {
        private Integer best;
        private Integer weekBest;
    }
}
