package com.kanban.domain.comment.dto;

import com.kanban.domain.comment.Comment;
import com.kanban.domain.comment.CommentAttachment;
import com.kanban.domain.comment.CommentReaction;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

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
        private List<ReactionInfo> reactions;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(Comment comment) {
            return of(comment, Map.of());
        }

        public static Detail of(Comment comment, Map<String, String> customEmojiUrlMap) {
            List<String> mentionList = comment.getMentions() != null && !comment.getMentions().isEmpty()
                    ? Arrays.asList(comment.getMentions().split(","))
                    : List.of();

            List<AttachmentInfo> attachmentList = comment.getAttachments() != null
                    ? comment.getAttachments().stream().map(AttachmentInfo::of).toList()
                    : List.of();

            List<ReactionInfo> reactionList = buildReactionList(comment.getReactions(), customEmojiUrlMap);

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

            return Detail.builder()
                    .id(comment.getId())
                    .taskId(comment.getTask().getId())
                    .author(authorInfo)
                    .content(comment.getContent())
                    .mentions(mentionList)
                    .attachments(attachmentList)
                    .reactions(reactionList)
                    .createdAt(comment.getCreatedAt())
                    .updatedAt(comment.getUpdatedAt())
                    .build();
        }

        private static List<ReactionInfo> buildReactionList(List<CommentReaction> reactions,
                                                             Map<String, String> customEmojiUrlMap) {
            if (reactions == null || reactions.isEmpty()) return List.of();

            Map<String, List<CommentReaction>> grouped = reactions.stream()
                    .collect(Collectors.groupingBy(CommentReaction::getEmoji, LinkedHashMap::new, Collectors.toList()));

            return grouped.entrySet().stream()
                    .map(entry -> {
                        String emoji = entry.getKey();
                        boolean isCustom = emoji.startsWith("custom:");
                        String imageUrl = null;
                        if (isCustom) {
                            String emojiId = emoji.substring("custom:".length());
                            imageUrl = customEmojiUrlMap.get(emojiId);
                        }
                        return ReactionInfo.builder()
                                .emoji(emoji)
                                .imageUrl(imageUrl)
                                .isCustom(isCustom)
                                .count(entry.getValue().size())
                                .users(entry.getValue().stream()
                                        .map(r -> ReactionUserInfo.builder()
                                                .id(r.getUser().getId())
                                                .name(r.getUser().getName())
                                                .build())
                                        .toList())
                                .build();
                    })
                    .toList();
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
    public static class ReactionInfo {
        private String emoji;
        private String imageUrl;
        private boolean isCustom;
        private int count;
        private List<ReactionUserInfo> users;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ReactionUserInfo {
        private String id;
        private String name;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ReactionsResponse {
        private List<ReactionInfo> reactions;
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
            return of(comments, Map.of());
        }

        public static ListResponse of(List<Comment> comments, Map<String, String> customEmojiUrlMap) {
            return ListResponse.builder()
                    .comments(comments.stream().map(c -> Detail.of(c, customEmojiUrlMap)).toList())
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
