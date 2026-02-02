package com.kanban.domain.comment.dto;

import com.kanban.domain.comment.Comment;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

public class CommentResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String taskId;
        private AuthorInfo author;
        private String content;
        private List<String> mentions;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(Comment comment) {
            List<String> mentionList = comment.getMentions() != null && !comment.getMentions().isEmpty()
                    ? Arrays.asList(comment.getMentions().split(","))
                    : List.of();

            return Detail.builder()
                    .id(comment.getId())
                    .taskId(comment.getTask().getId())
                    .author(AuthorInfo.builder()
                            .id(comment.getAuthor().getId())
                            .name(comment.getAuthor().getName())
                            .profileImage(comment.getAuthor().getProfileImage())
                            .build())
                    .content(comment.getContent())
                    .mentions(mentionList)
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
        private List<Detail> comments;
        private int totalCount;

        public static ListResponse of(List<Comment> comments) {
            return ListResponse.builder()
                    .comments(comments.stream().map(Detail::of).toList())
                    .totalCount(comments.size())
                    .build();
        }
    }
}
