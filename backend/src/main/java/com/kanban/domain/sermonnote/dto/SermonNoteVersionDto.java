package com.kanban.domain.sermonnote.dto;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 설교 노트 버전 기록 API. JSON 은 snake_case + non_null. 계약: docs/Tech/sermon-note-versions-api.md */
public class SermonNoteVersionDto {

    /** PUT /sermon-notes/{noteId}/versions/{id} — at 은 epoch millis */
    @Getter
    @Setter
    @NoArgsConstructor
    public static class Put {
        private String reason;
        private String title;
        private String body;
        private Integer chars;
        private Long at;
    }

    /** 응답 한 장. 목록·PUT 응답엔 body 가 없다(키 없음) */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class Item {
        private String id;
        private String noteId;
        private String reason;
        private String title;
        private Integer chars;
        /** epoch millis */
        private Long at;

        private String body;
    }

    @Getter
    @AllArgsConstructor
    public static class Items {
        private List<Item> items;
    }

    /** 목록 쿼리 결과 (body 없이) */
    @Getter
    @AllArgsConstructor
    public static class Row {
        private String id;
        private String noteId;
        private String reason;
        private String title;
        private int chars;
        private LocalDateTime at;

        public Item toItem() {
            return Item.builder()
                    .id(id)
                    .noteId(noteId)
                    .reason(reason)
                    .title(title)
                    .chars(chars)
                    .at(millis(at))
                    .build();
        }
    }

    public static Long millis(LocalDateTime t) {
        return t == null ? null : t.toInstant(ZoneOffset.UTC).toEpochMilli();
    }
}
