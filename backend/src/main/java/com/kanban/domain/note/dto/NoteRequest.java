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
        private String type; // FOLDER, DOCUMENT, or BOARD

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
    public static class RestoreVersion {
        // 복원 직전 화면의 라이브 내용. 제공되면 미발행 편집분까지 포함해
        // 복원 전 스냅샷 버전으로 보존한다. 없으면 발행본(note.content) 사용.
        @Size(max = 200, message = "제목은 200자 이내여야 합니다")
        private String currentTitle;

        private String currentContent;
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
