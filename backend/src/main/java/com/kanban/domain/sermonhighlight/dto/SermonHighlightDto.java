package com.kanban.domain.sermonhighlight.dto;

import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 성경 읽기 형광펜 API. JSON 은 snake_case + non_null. 계약: docs/Tech/sermon-highlight-api.md */
public class SermonHighlightDto {

    /** PUT /sermon-highlights/{id} — 있으면 고치고 없으면 만든다 (통째로 교체) */
    @Getter
    @Setter
    @NoArgsConstructor
    public static class Upsert {
        private Integer book;
        private Integer chapter;
        private Integer verseFrom;
        private Integer verseTo;
        private Integer charStart;
        private Integer charEnd;
        private String color;
        private Boolean underline;
        private String memo;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Item {
        private String id;
        private int book;
        private int chapter;
        private int verseFrom;
        private int verseTo;
        private Integer charStart;
        private Integer charEnd;
        private String color;
        private boolean underline;
        private String memo;
        /** true = 이미 지운 형광펜 (다른 기기에서 지움) — 기기도 지운다 */
        private boolean deleted;

        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
    }
}
