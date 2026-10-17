package com.kanban.domain.note.dto;

import jakarta.validation.Valid;
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

        /** 인라인 메모 앵커. null이면 블록 댓글 */
        @Valid
        private Anchor anchor;
    }

    /** 텍스트 범위 앵커 — W3C TextQuoteSelector + TextPositionSelector */
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Anchor {
        @NotBlank(message = "앵커 원문은 필수입니다")
        @Size(max = 500, message = "앵커 원문은 500자 이내여야 합니다")
        private String text;

        @Size(max = 64)
        private String prefix;

        @Size(max = 64)
        private String suffix;

        private Integer start;

        private Integer end;
    }

    /** 재탐색 결과 보고 (오프셋 갱신 / 고아 처리) */
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateAnchor {
        @Valid
        private Anchor anchor;

        /** 재탐색 결과 다른 블록에서 찾은 경우 */
        @Size(max = 100)
        private String blockId;

        /** ATTACHED / ORPHANED */
        @NotBlank
        @Size(max = 16)
        private String status;
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
