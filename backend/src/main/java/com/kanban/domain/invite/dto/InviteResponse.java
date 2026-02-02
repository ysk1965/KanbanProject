package com.kanban.domain.invite.dto;

import com.kanban.domain.board.BoardRole;
import com.kanban.domain.invite.InviteLink;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class InviteResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String code;
        private BoardRole role;
        private Integer maxUses;
        private Integer usedCount;
        private LocalDateTime expiresAt;
        private boolean isActive;
        private CreatorInfo createdBy;
        private LocalDateTime createdAt;

        public static Detail of(InviteLink link) {
            return Detail.builder()
                    .id(link.getId())
                    .code(link.getCode())
                    .role(link.getRole())
                    .maxUses(link.getMaxUses())
                    .usedCount(link.getUsedCount())
                    .expiresAt(link.getExpiresAt())
                    .isActive(link.getIsActive())
                    .createdBy(CreatorInfo.of(link))
                    .createdAt(link.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class CreatorInfo {
        private String id;
        private String name;

        public static CreatorInfo of(InviteLink link) {
            return CreatorInfo.builder()
                    .id(link.getCreatedBy().getId())
                    .name(link.getCreatedBy().getName())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<Detail> invites;

        public static ListResponse of(List<InviteLink> links) {
            return ListResponse.builder()
                    .invites(links.stream().map(Detail::of).toList())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Info {
        private String boardId;
        private String boardName;
        private BoardRole role;
        private boolean isValid;
        private String message;

        public static Info of(InviteLink link) {
            boolean isValid = link.isValid();
            String message = isValid ? "유효한 초대 링크입니다" : "만료되었거나 유효하지 않은 초대 링크입니다";

            return Info.builder()
                    .boardId(link.getBoard().getId())
                    .boardName(link.getBoard().getName())
                    .role(link.getRole())
                    .isValid(isValid)
                    .message(message)
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class AcceptResult {
        private String boardId;
        private String boardName;
        private BoardRole role;
        private String message;
    }
}
