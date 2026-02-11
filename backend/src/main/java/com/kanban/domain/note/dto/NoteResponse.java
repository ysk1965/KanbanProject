package com.kanban.domain.note.dto;

import com.kanban.domain.note.*;
import com.kanban.domain.user.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class NoteResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TreeItem {
        private String id;
        private String parentId;
        private String type;
        private String title;
        private int position;
        private int depth;
        private List<TagInfo> tags;
        private UserInfo createdBy;
        private UserInfo updatedBy;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        private List<TreeItem> children;

        public static TreeItem of(Note note, List<TagInfo> tags, List<TreeItem> children) {
            return TreeItem.builder()
                    .id(note.getId())
                    .parentId(note.getParent() != null ? note.getParent().getId() : null)
                    .type(note.getType().name())
                    .title(note.getTitle())
                    .position(note.getPosition())
                    .depth(note.getDepth())
                    .tags(tags)
                    .createdBy(UserInfo.of(note.getCreatedBy()))
                    .updatedBy(UserInfo.of(note.getUpdatedBy()))
                    .createdAt(note.getCreatedAt())
                    .updatedAt(note.getUpdatedAt())
                    .children(children)
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String parentId;
        private String type;
        private String title;
        private String content;
        private int position;
        private int depth;
        private List<TagInfo> tags;
        private UserInfo createdBy;
        private UserInfo updatedBy;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        private int versionCount;
        private String aiSuggestions;
        private String aiContentSnapshot;

        public static Detail of(Note note, List<TagInfo> tags, int versionCount) {
            return Detail.builder()
                    .id(note.getId())
                    .parentId(note.getParent() != null ? note.getParent().getId() : null)
                    .type(note.getType().name())
                    .title(note.getTitle())
                    .content(note.getContent())
                    .position(note.getPosition())
                    .depth(note.getDepth())
                    .tags(tags)
                    .createdBy(UserInfo.of(note.getCreatedBy()))
                    .updatedBy(UserInfo.of(note.getUpdatedBy()))
                    .createdAt(note.getCreatedAt())
                    .updatedAt(note.getUpdatedAt())
                    .versionCount(versionCount)
                    .aiSuggestions(note.getAiSuggestions())
                    .aiContentSnapshot(note.getAiContentSnapshot())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListItem {
        private String id;
        private String title;
        private String parentId;
        private String parentTitle;
        private List<TagInfo> tags;
        private UserInfo updatedBy;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static ListItem of(Note note, String parentTitle, List<TagInfo> tags) {
            return ListItem.builder()
                    .id(note.getId())
                    .title(note.getTitle())
                    .parentId(note.getParent() != null ? note.getParent().getId() : null)
                    .parentTitle(parentTitle)
                    .tags(tags)
                    .updatedBy(UserInfo.of(note.getUpdatedBy()))
                    .createdAt(note.getCreatedAt())
                    .updatedAt(note.getUpdatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class VersionInfo {
        private String id;
        private int versionNumber;
        private String title;
        private UserInfo createdBy;
        private LocalDateTime createdAt;

        public static VersionInfo of(NoteVersion version) {
            return VersionInfo.builder()
                    .id(version.getId())
                    .versionNumber(version.getVersionNumber())
                    .title(version.getTitle())
                    .createdBy(UserInfo.of(version.getCreatedBy()))
                    .createdAt(version.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class VersionDetail {
        private String id;
        private int versionNumber;
        private String title;
        private String content;
        private UserInfo createdBy;
        private LocalDateTime createdAt;

        public static VersionDetail of(NoteVersion version) {
            return VersionDetail.builder()
                    .id(version.getId())
                    .versionNumber(version.getVersionNumber())
                    .title(version.getTitle())
                    .content(version.getContent())
                    .createdBy(UserInfo.of(version.getCreatedBy()))
                    .createdAt(version.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TagInfo {
        private String id;
        private String name;
        private String color;

        public static TagInfo of(NoteTag tag) {
            return TagInfo.builder()
                    .id(tag.getId())
                    .name(tag.getName())
                    .color(tag.getColor())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class UserInfo {
        private String id;
        private String name;
        private String profileImage;

        public static UserInfo of(User user) {
            return UserInfo.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .profileImage(user.getProfileImage())
                    .build();
        }
    }
}
