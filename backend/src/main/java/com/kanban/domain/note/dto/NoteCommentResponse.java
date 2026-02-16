package com.kanban.domain.note.dto;

import com.kanban.domain.note.NoteComment;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

public class NoteCommentResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String noteId;
        private String blockId;
        private String parentId;
        private AuthorInfo author;
        private String content;
        private List<String> mentions;
        private boolean isResolved;
        private AuthorInfo resolvedBy;
        private LocalDateTime resolvedAt;
        private List<Detail> replies;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(NoteComment comment, List<Detail> replies) {
            List<String> mentionList = comment.getMentions() != null && !comment.getMentions().isEmpty()
                    ? Arrays.asList(comment.getMentions().split(","))
                    : List.of();

            AuthorInfo authorInfo = comment.getAuthor() != null
                    ? AuthorInfo.builder()
                            .id(comment.getAuthor().getId())
                            .name(comment.getAuthor().getName())
                            .profileImage(comment.getAuthor().getProfileImage())
                            .build()
                    : AuthorInfo.builder()
                            .id(null)
                            .name("알 수 없는 사용자")
                            .profileImage(null)
                            .build();

            AuthorInfo resolvedByInfo = comment.getResolvedBy() != null
                    ? AuthorInfo.builder()
                            .id(comment.getResolvedBy().getId())
                            .name(comment.getResolvedBy().getName())
                            .profileImage(comment.getResolvedBy().getProfileImage())
                            .build()
                    : null;

            return Detail.builder()
                    .id(comment.getId())
                    .noteId(comment.getNote().getId())
                    .blockId(comment.getBlockId())
                    .parentId(comment.getParent() != null ? comment.getParent().getId() : null)
                    .author(authorInfo)
                    .content(comment.getContent())
                    .mentions(mentionList)
                    .isResolved(comment.getIsResolved())
                    .resolvedBy(resolvedByInfo)
                    .resolvedAt(comment.getResolvedAt())
                    .replies(replies)
                    .createdAt(comment.getCreatedAt())
                    .updatedAt(comment.getUpdatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class AuthorInfo {
        private String id;
        private String name;
        private String profileImage;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<Detail> threads;
        private int totalThreads;
    }
}
