package com.kanban.domain.comment.dto;

import com.kanban.domain.comment.Comment;
import com.kanban.domain.comment.CommentAttachment;
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
        private List<AttachmentInfo> attachments;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(Comment comment) {
            List<String> mentionList = comment.getMentions() != null && !comment.getMentions().isEmpty()
                    ? Arrays.asList(comment.getMentions().split(","))
                    : List.of();

            List<AttachmentInfo> attachmentList = comment.getAttachments() != null
                    ? comment.getAttachments().stream().map(AttachmentInfo::of).toList()
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
                    .attachments(attachmentList)
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
    public static class AttachmentInfo {
        private String id;
        private String fileName;
        private String url;
        private String thumbnailUrl;
        private String contentType;
        private Long fileSize;
        private LocalDateTime createdAt;

        public static AttachmentInfo of(CommentAttachment attachment) {
            return AttachmentInfo.builder()
                    .id(attachment.getId())
                    .fileName(attachment.getOriginalFileName())
                    .url(attachment.getUrl())
                    .thumbnailUrl(attachment.getThumbnailUrl())
                    .contentType(attachment.getContentType())
                    .fileSize(attachment.getFileSize())
                    .createdAt(attachment.getCreatedAt())
                    .build();
        }
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

    @Getter
    @Builder
    @AllArgsConstructor
    public static class SummaryItem {
        private String id;
        private String taskId;
        private String taskTitle;
        private String content;
        private LocalDateTime createdAt;

        public static SummaryItem of(Comment comment) {
            return SummaryItem.builder()
                    .id(comment.getId())
                    .taskId(comment.getTask().getId())
                    .taskTitle(comment.getTask().getTitle())
                    .content(comment.getContent())
                    .createdAt(comment.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class SummaryListResponse {
        private List<SummaryItem> comments;
        private int totalCount;

        public static SummaryListResponse of(List<Comment> comments) {
            return SummaryListResponse.builder()
                    .comments(comments.stream().map(SummaryItem::of).toList())
                    .totalCount(comments.size())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MentionSummaryItem {
        private String id;
        private String taskId;
        private String taskTitle;
        private String content;
        private String authorName;
        private LocalDateTime createdAt;

        public static MentionSummaryItem of(Comment comment) {
            return MentionSummaryItem.builder()
                    .id(comment.getId())
                    .taskId(comment.getTask().getId())
                    .taskTitle(comment.getTask().getTitle())
                    .content(comment.getContent())
                    .authorName(comment.getAuthor() != null ? comment.getAuthor().getName() : null)
                    .createdAt(comment.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MentionSummaryListResponse {
        private List<MentionSummaryItem> comments;
        private int totalCount;

        public static MentionSummaryListResponse of(List<Comment> comments) {
            return MentionSummaryListResponse.builder()
                    .comments(comments.stream().map(MentionSummaryItem::of).toList())
                    .totalCount(comments.size())
                    .build();
        }
    }
}
