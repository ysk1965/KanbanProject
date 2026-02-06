package com.kanban.domain.inquiry.dto;

import com.kanban.domain.inquiry.Inquiry;
import com.kanban.domain.inquiry.InquiryAttachment;
import com.kanban.domain.inquiry.InquiryReply;
import com.kanban.domain.inquiry.InquiryStatus;
import com.kanban.domain.inquiry.ReplyType;
import com.kanban.domain.user.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

public class InquiryResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Summary {
        private String id;
        private String title;
        private InquiryStatus status;
        private UserInfo user;
        private int replyCount;
        private int attachmentCount;
        private boolean hasNewReply;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Summary of(Inquiry inquiry) {
            return Summary.builder()
                    .id(inquiry.getId())
                    .title(inquiry.getTitle())
                    .status(inquiry.getStatus())
                    .user(UserInfo.of(inquiry.getUser()))
                    .replyCount(inquiry.getReplies() != null ? inquiry.getReplies().size() : 0)
                    .attachmentCount(inquiry.getAttachments() != null ? inquiry.getAttachments().size() : 0)
                    .hasNewReply(inquiry.isHasNewReply())
                    .createdAt(inquiry.getCreatedAt())
                    .updatedAt(inquiry.getUpdatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String title;
        private String content;
        private InquiryStatus status;
        private UserInfo user;
        private List<AttachmentInfo> attachments;
        private List<ReplyDetail> replies;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(Inquiry inquiry, List<InquiryReply> replies) {
            return Detail.builder()
                    .id(inquiry.getId())
                    .title(inquiry.getTitle())
                    .content(inquiry.getContent())
                    .status(inquiry.getStatus())
                    .user(UserInfo.of(inquiry.getUser()))
                    .attachments(inquiry.getAttachments() != null
                            ? inquiry.getAttachments().stream().map(AttachmentInfo::of).collect(Collectors.toList())
                            : Collections.emptyList())
                    .replies(replies != null
                            ? replies.stream().map(ReplyDetail::of).collect(Collectors.toList())
                            : Collections.emptyList())
                    .createdAt(inquiry.getCreatedAt())
                    .updatedAt(inquiry.getUpdatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ReplyDetail {
        private String id;
        private UserInfo admin;
        private UserInfo user;
        private ReplyType replyType;
        private String content;
        private LocalDateTime createdAt;

        public static ReplyDetail of(InquiryReply reply) {
            return ReplyDetail.builder()
                    .id(reply.getId())
                    .admin(reply.getAdmin() != null ? UserInfo.of(reply.getAdmin()) : null)
                    .user(reply.getUser() != null ? UserInfo.of(reply.getUser()) : null)
                    .replyType(reply.getReplyType())
                    .content(reply.getContent())
                    .createdAt(reply.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class AttachmentInfo {
        private String id;
        private String originalFileName;
        private String url;
        private String thumbnailUrl;
        private String contentType;
        private Long fileSize;

        public static AttachmentInfo of(InquiryAttachment attachment) {
            return AttachmentInfo.builder()
                    .id(attachment.getId())
                    .originalFileName(attachment.getOriginalFileName())
                    .url(attachment.getUrl())
                    .thumbnailUrl(attachment.getThumbnailUrl())
                    .contentType(attachment.getContentType())
                    .fileSize(attachment.getFileSize())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class UserInfo {
        private String id;
        private String name;
        private String email;
        private String profileImage;

        public static UserInfo of(User user) {
            if (user == null) return null;
            return UserInfo.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .email(user.getEmail())
                    .profileImage(user.getProfileImage())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class InquiryList {
        private List<Summary> inquiries;
        private long total;
        private int page;
        private int size;
    }
}
