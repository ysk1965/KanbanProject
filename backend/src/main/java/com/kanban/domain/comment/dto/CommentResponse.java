package com.kanban.domain.comment.dto;

import com.kanban.domain.comment.Comment;
import com.kanban.domain.comment.CommentAttachment;
import com.kanban.domain.comment.CommentReaction;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.*;
import java.util.function.UnaryOperator;
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
        private String parentId;
        private String parentAuthorName;
        /** 이 댓글이 달린 체크리스트 항목. null이면 태스크에 직접 달린 댓글이다. */
        private String checklistItemId;
        /** 항목 제목 — 댓글 목록의 칩에 쓴다. 항목을 찾지 못하면 null. */
        private String checklistItemTitle;
        /** 항목이 휴지통에 있는지. true면 칩에 취소선을 긋고 클릭을 막는다. */
        private Boolean checklistItemDeleted;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(Comment comment) {
            return of(comment, Map.of(), null, Map.of());
        }

        public static Detail of(Comment comment, Map<String, String> customEmojiUrlMap) {
            return of(comment, customEmojiUrlMap, null, Map.of());
        }

        public static Detail of(Comment comment, Map<String, String> customEmojiUrlMap,
                                 UnaryOperator<String> urlResolver) {
            return of(comment, customEmojiUrlMap, urlResolver, Map.of());
        }

        /**
         * @param checklistRefs 체크리스트 항목 id → 제목/삭제여부. 목록 조회에서 한 번에 로드해 넘긴다
         *                      (댓글마다 조회하면 N+1). 단건 응답에서는 빈 맵이어도 되며,
         *                      그때는 id만 실리고 제목은 프론트가 이미 알고 있는 값을 쓴다.
         */
        public static Detail of(Comment comment, Map<String, String> customEmojiUrlMap,
                                 UnaryOperator<String> urlResolver,
                                 Map<String, ChecklistRef> checklistRefs) {
            List<String> mentionList = comment.getMentions() != null && !comment.getMentions().isEmpty()
                    ? Arrays.asList(comment.getMentions().split(","))
                    : List.of();

            List<AttachmentInfo> attachmentList = comment.getAttachments() != null
                    ? comment.getAttachments().stream().map(att -> AttachmentInfo.of(att, urlResolver)).toList()
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

            ChecklistRef ref = comment.getChecklistItemId() != null
                    ? checklistRefs.get(comment.getChecklistItemId()) : null;

            return Detail.builder()
                    .id(comment.getId())
                    .taskId(comment.getTask().getId())
                    .author(authorInfo)
                    .content(comment.getContent())
                    .mentions(mentionList)
                    .attachments(attachmentList)
                    .reactions(reactionList)
                    .parentId(comment.getParent() != null ? comment.getParent().getId() : null)
                    .parentAuthorName(comment.getParent() != null && comment.getParent().getAuthor() != null
                            ? comment.getParent().getAuthor().getName() : null)
                    .checklistItemId(comment.getChecklistItemId())
                    .checklistItemTitle(ref != null ? ref.getTitle() : null)
                    .checklistItemDeleted(ref != null ? ref.isDeleted() : null)
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

    /**
     * 댓글에 붙일 체크리스트 항목 참조. 응답 DTO 전용 값이며 엔티티 연관이 아니다
     * (삭제된 항목도 실어야 하므로 {@code @SQLRestriction}을 우회한 조회 결과를 담는다).
     */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class ChecklistRef {
        private String title;
        private boolean deleted;
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

        public static AttachmentInfo of(CommentAttachment attachment, UnaryOperator<String> urlResolver) {
            String url;
            String thumbUrl;
            if (urlResolver != null && attachment.getS3Key() != null) {
                url = urlResolver.apply(attachment.getS3Key());
                thumbUrl = attachment.getThumbnailS3Key() != null
                        ? urlResolver.apply(attachment.getThumbnailS3Key()) : null;
            } else {
                url = attachment.getUrl();
                thumbUrl = attachment.getThumbnailUrl();
            }
            return AttachmentInfo.builder()
                    .id(attachment.getId())
                    .fileName(attachment.getOriginalFileName())
                    .url(url)
                    .thumbnailUrl(thumbUrl)
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
            return of(comments, Map.of(), null);
        }

        public static ListResponse of(List<Comment> comments, Map<String, String> customEmojiUrlMap) {
            return of(comments, customEmojiUrlMap, null);
        }

        public static ListResponse of(List<Comment> comments, Map<String, String> customEmojiUrlMap,
                                       UnaryOperator<String> urlResolver) {
            return of(comments, customEmojiUrlMap, urlResolver, Map.of());
        }

        public static ListResponse of(List<Comment> comments, Map<String, String> customEmojiUrlMap,
                                       UnaryOperator<String> urlResolver,
                                       Map<String, ChecklistRef> checklistRefs) {
            return ListResponse.builder()
                    .comments(comments.stream()
                            .map(c -> Detail.of(c, customEmojiUrlMap, urlResolver, checklistRefs)).toList())
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
