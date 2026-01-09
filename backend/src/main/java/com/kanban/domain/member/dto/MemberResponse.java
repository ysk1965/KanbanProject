package com.kanban.domain.member.dto;

import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.Role;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class MemberResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private UserInfo user;
        private Role role;
        private LocalDateTime joinedAt;
        private InvitedByInfo invitedBy;

        public static Detail of(BoardMember member) {
            return Detail.builder()
                    .id(member.getId())
                    .user(UserInfo.of(member))
                    .role(member.getRole())
                    .joinedAt(member.getJoinedAt())
                    .invitedBy(member.getInvitedBy() != null ? InvitedByInfo.of(member) : null)
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

        public static UserInfo of(BoardMember member) {
            return UserInfo.builder()
                    .id(member.getUser().getId())
                    .name(member.getUser().getName())
                    .email(member.getUser().getEmail())
                    .profileImage(member.getUser().getProfileImage())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class InvitedByInfo {
        private String id;
        private String name;

        public static InvitedByInfo of(BoardMember member) {
            return InvitedByInfo.builder()
                    .id(member.getInvitedBy().getId())
                    .name(member.getInvitedBy().getName())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private int total;
        private int billable;
        private List<Detail> members;

        public static ListResponse of(List<BoardMember> members) {
            int total = members.size();
            int billable = (int) members.stream().filter(BoardMember::isBillable).count();

            return ListResponse.builder()
                    .total(total)
                    .billable(billable)
                    .members(members.stream().map(Detail::of).toList())
                    .build();
        }
    }
}
