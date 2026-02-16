package com.kanban.domain.note.dto;

import com.kanban.domain.note.NoteComment;
import com.kanban.domain.note.NoteCommentReaction;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

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
        private List<ReactionInfo> reactions;
        private boolean isResolved;
        private AuthorInfo resolvedBy;
        private LocalDateTime resolvedAt;
        private List<Detail> replies;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(NoteComment comment, List<Detail> replies) {
            return of(comment, replies, Map.of());
        }

        public static Detail of(NoteComment comment, List<Detail> replies, Map<String, String> customEmojiUrlMap) {
            List<String> mentionList = comment.getMentions() != null && !comment.getMentions().isEmpty()
                    ? Arrays.asList(comment.getMentions().split(","))
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
                    .reactions(reactionList)
                    .isResolved(comment.getIsResolved())
                    .resolvedBy(resolvedByInfo)
                    .resolvedAt(comment.getResolvedAt())
                    .replies(replies)
                    .createdAt(comment.getCreatedAt())
                    .updatedAt(comment.getUpdatedAt())
                    .build();
        }

        private static List<ReactionInfo> buildReactionList(List<NoteCommentReaction> reactions,
                                                             Map<String, String> customEmojiUrlMap) {
            if (reactions == null || reactions.isEmpty()) return List.of();

            Map<String, List<NoteCommentReaction>> grouped = reactions.stream()
                    .collect(Collectors.groupingBy(NoteCommentReaction::getEmoji, LinkedHashMap::new, Collectors.toList()));

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
    public static class ListResponse {
        private List<Detail> threads;
        private int totalThreads;
    }
}
