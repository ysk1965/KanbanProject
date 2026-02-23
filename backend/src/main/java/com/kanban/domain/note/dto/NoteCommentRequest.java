package com.kanban.domain.note.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

public class NoteCommentRequest {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Create {
        @NotBlank(message = "댓글 내용은 필수입니다")
        @Size(max = 2000, message = "댓글은 2000자 이내여야 합니다")
        private String content;

        private String blockId;

        private String parentId;

        private List<String> mentions;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Update {
        @NotBlank(message = "댓글 내용은 필수입니다")
        @Size(max = 2000, message = "댓글은 2000자 이내여야 합니다")
        private String content;

        private List<String> mentions;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ToggleReaction {
        @NotBlank(message = "이모지는 필수입니다")
        @Size(max = 10, message = "이모지는 10자 이내여야 합니다")
        private String emoji;
    }
}
