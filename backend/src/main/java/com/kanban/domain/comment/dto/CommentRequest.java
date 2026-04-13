package com.kanban.domain.comment.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

public class CommentRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @Size(max = 2000, message = "댓글은 2000자 이내여야 합니다")
        private String content;

        private List<String> mentions;

        /** 미리 업로드된 파일의 임시 키 목록 */
        private List<String> fileKeys;

        /** 답글 대상 댓글 ID (null이면 루트 댓글) */
        private String parentId;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @NotBlank(message = "댓글 내용은 필수입니다")
        @Size(max = 2000, message = "댓글은 2000자 이내여야 합니다")
        private String content;

        private List<String> mentions;

        /** 유지할 기존 첨부파일 ID 목록 (여기 없는 건 삭제) */
        private List<String> keepAttachmentIds;

        /** 새로 추가할 파일의 임시 키 목록 */
        private List<String> newFileKeys;
    }

    @Getter
    @NoArgsConstructor
    public static class ToggleReaction {
        @NotBlank(message = "이모지는 필수입니다")
        @Size(max = 10, message = "이모지는 10자 이내여야 합니다")
        private String emoji;
    }
}
