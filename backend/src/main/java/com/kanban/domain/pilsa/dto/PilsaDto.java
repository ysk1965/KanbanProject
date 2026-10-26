package com.kanban.domain.pilsa.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 이번 주 말씀 필사 API. 계약서: docs/Tech/sermon-pilsa-api.md */
public class PilsaDto {

    /** PUT /week 요청 */
    @Getter
    @Setter
    @NoArgsConstructor
    public static class PutWeek {
        private LocalDate week;
        private List<ChapterIn> chapters;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ChapterIn {
        private Integer b;
        private Integer c;
        private String reason;
        private Integer verses;
    }

    /** GET / PUT /week 응답 */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class Week {
        private LocalDate week;
        private Instant endsAt;
        private List<Chapter> chapters;
        private int completedChapters;
        private boolean weekDone;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Chapter {
        private int b;
        private int c;
        private String reason;
        private int verses;
        private List<Integer> done;
    }

    /** POST /verses 요청 */
    @Getter
    @Setter
    @NoArgsConstructor
    public static class VerseIn {
        private LocalDate week;
        private Integer b;
        private Integer c;
        private Integer v;
        private Integer chars;
        private Long ms;
    }

    /** POST /verses 응답 */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class VerseResult {
        private int b;
        private int c;
        private List<Integer> done;
        private boolean chapterDone;
        private boolean weekDone;
        private int awarded;
    }
}
