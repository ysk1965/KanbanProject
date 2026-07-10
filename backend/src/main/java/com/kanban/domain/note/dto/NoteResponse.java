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
        private Boolean isShared;
        private String shareToken;
        private boolean hasUnpublishedDraft;
        private int likeCount;
        private boolean liked;

        public static Detail of(Note note, List<TagInfo> tags, int versionCount) {
            return of(note, tags, versionCount, false, 0, false);
        }

        public static Detail of(Note note, List<TagInfo> tags, int versionCount, boolean hasUnpublishedDraft) {
            return of(note, tags, versionCount, hasUnpublishedDraft, 0, false);
        }

        public static Detail of(Note note, List<TagInfo> tags, int versionCount, boolean hasUnpublishedDraft,
                                 int likeCount, boolean liked) {
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
                    .isShared(note.getIsShared())
                    .shareToken(note.getShareToken())
                    .hasUnpublishedDraft(hasUnpublishedDraft)
                    .likeCount(likeCount)
                    .liked(liked)
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class SharedNote {
        private String title;
        private String content;
        private String type;
        private List<TagInfo> tags;
        private String authorName;
        private LocalDateTime updatedAt;
        /** 링크 미리보기(og:description)용 평문 발췌. BOARD/발췌 불가 시 null */
        private String excerpt;
        /** 상위 폴더 제목 (없으면 null) — 미리보기 브레드크럼용 */
        private String parentTitle;
        /** 소속 보드명 또는 조직명 (미리보기 출처 표시용) */
        private String boardName;

        public static SharedNote of(Note note, List<TagInfo> tags) {
            String boardName = note.getBoard() != null
                    ? note.getBoard().getName()
                    : (note.getOrganization() != null ? note.getOrganization().getName() : null);

            return SharedNote.builder()
                    .title(note.getTitle())
                    .content(note.getContent())
                    .type(note.getType().name())
                    .tags(tags)
                    .authorName(note.getUpdatedBy().getName())
                    .updatedAt(note.getUpdatedAt())
                    .excerpt(NoteExcerptExtractor.extract(note.getContent(), note.getType()))
                    .parentTitle(note.getParent() != null ? note.getParent().getTitle() : null)
                    .boardName(boardName)
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
    public static class BoardNoteSection {
        private String boardId;
        private String boardName;
        private int noteCount;
        private String userRole;
        private List<TreeItem> tree;

        public static BoardNoteSection of(String boardId, String boardName, int noteCount, String userRole, List<TreeItem> tree) {
            return BoardNoteSection.builder()
                    .boardId(boardId)
                    .boardName(boardName)
                    .noteCount(noteCount)
                    .userRole(userRole)
                    .tree(tree)
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TrashItem {
        private String id;
        private String type;
        private String title;
        private String parentId;
        private String parentTitle;
        private boolean parentDeleted;
        private boolean hasChildren;
        private UserInfo deletedBy;
        private LocalDateTime deletedAt;
        private LocalDateTime createdAt;

        public static TrashItem of(Note note, boolean hasChildren) {
            Note parent = note.getParent();
            boolean parentDeleted = parent != null && Boolean.TRUE.equals(parent.getIsDeleted());
            return TrashItem.builder()
                    .id(note.getId())
                    .type(note.getType().name())
                    .title(note.getTitle())
                    .parentId(parent != null ? parent.getId() : null)
                    .parentTitle(parent != null ? parent.getTitle() : null)
                    .parentDeleted(parentDeleted)
                    .hasChildren(hasChildren)
                    .deletedBy(UserInfo.of(note.getDeletedBy()))
                    .deletedAt(note.getDeletedAt())
                    .createdAt(note.getCreatedAt())
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
            if (user == null) return null;
            return UserInfo.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .profileImage(user.getProfileImage())
                    .build();
        }
    }
}
