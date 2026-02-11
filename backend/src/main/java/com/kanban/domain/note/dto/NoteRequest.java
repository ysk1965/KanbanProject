package com.kanban.domain.note.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

public class NoteRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "제목은 필수입니다")
        @Size(max = 200, message = "제목은 200자 이내여야 합니다")
        private String title;

        @NotNull(message = "타입은 필수입니다")
        private String type; // FOLDER or DOCUMENT

        private String parentId;
        private String content;
        private List<String> tagIds;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 200, message = "제목은 200자 이내여야 합니다")
        private String title;

        private String content;
        private List<String> tagIds;
    }

    @Getter
    @NoArgsConstructor
    public static class Move {
        private String parentId; // null = root
        private Integer position;
    }

    @Getter
    @NoArgsConstructor
    public static class Reorder {
        @NotNull(message = "순서 목록은 필수입니다")
        private List<ReorderItem> items;
    }

    @Getter
    @NoArgsConstructor
    public static class ReorderItem {
        private String id;
        private Integer position;
    }
}
