package com.kanban.domain.board.dto;

import com.kanban.domain.board.BoardJoinRequest;
import com.kanban.domain.board.JoinRequestStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

public class BoardJoinRequestDTO {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CreateRequest {
        private String message;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String boardId;
        private RequesterInfo requester;
        private JoinRequestStatus status;
        private String message;
        private ReviewerInfo reviewedBy;
        private LocalDateTime reviewedAt;
        private LocalDateTime createdAt;

        public static Detail of(BoardJoinRequest request) {
            return Detail.builder()
                    .id(request.getId())
                    .boardId(request.getBoard().getId())
                    .requester(RequesterInfo.of(request.getRequester()))
                    .status(request.getStatus())
                    .message(request.getMessage())
                    .reviewedBy(request.getReviewedBy() != null ? ReviewerInfo.of(request.getReviewedBy()) : null)
                    .reviewedAt(request.getReviewedAt())
                    .createdAt(request.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class RequesterInfo {
        private String id;
        private String name;
        private String email;
        private String profileImage;

        public static RequesterInfo of(com.kanban.domain.user.User user) {
            return RequesterInfo.builder()
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
    public static class ReviewerInfo {
        private String id;
        private String name;

        public static ReviewerInfo of(com.kanban.domain.user.User user) {
            return ReviewerInfo.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<Detail> requests;
    }
}
