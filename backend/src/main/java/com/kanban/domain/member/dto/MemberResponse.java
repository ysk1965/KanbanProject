package com.kanban.domain.member.dto;

import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardRole;
import com.kanban.domain.organization.OrganizationMember;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.io.Serial;
import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

public class MemberResponse {

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Detail implements Serializable {
        @Serial
        private static final long serialVersionUID = 1L;
        private String id;
        private UserInfo user;
        private BoardRole role;
        private LocalDateTime joinedAt;
        private InvitedByInfo invitedBy;
        private String assigneeColor;
        private Integer displayOrder;

        public static Detail of(BoardMember member) {
            return Detail.builder()
                    .id(member.getId())
                    .user(UserInfo.of(member))
                    .role(member.getRole())
                    .joinedAt(member.getJoinedAt())
                    .invitedBy(member.getInvitedBy() != null ? InvitedByInfo.of(member) : null)
                    .assigneeColor(member.getAssigneeColor())
                    .displayOrder(member.getDisplayOrder())
                    .build();
        }
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UserInfo implements Serializable {
        @Serial
        private static final long serialVersionUID = 1L;
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
    @NoArgsConstructor
    @AllArgsConstructor
    public static class InvitedByInfo implements Serializable {
        @Serial
        private static final long serialVersionUID = 1L;
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
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ListResponse implements Serializable {
        @Serial
        private static final long serialVersionUID = 1L;

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

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class InviteResult implements Serializable {
        @Serial
        private static final long serialVersionUID = 1L;

        private String type;  // "DIRECT_ADD" or "EMAIL_SENT"
        private Detail member;  // 직접 추가된 경우
        private String email;   // 이메일 발송된 경우
        private String role;    // 이메일 발송된 경우

        public static InviteResult ofDirectAdd(BoardMember member) {
            return InviteResult.builder()
                    .type("DIRECT_ADD")
                    .member(Detail.of(member))
                    .build();
        }

        public static InviteResult ofEmailSent(String email, String role) {
            return InviteResult.builder()
                    .type("EMAIL_SENT")
                    .email(email)
                    .role(role)
                    .build();
        }
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OrgCandidate {
        private String userId;
        private String name;
        private String email;
        private String profileImage;
        private String department;
        private String position;

        public static OrgCandidate of(OrganizationMember om) {
            return OrgCandidate.builder()
                    .userId(om.getUser().getId())
                    .name(om.getUser().getName())
                    .email(om.getUser().getEmail())
                    .profileImage(om.getUser().getProfileImage())
                    .department(om.getDepartment() != null ? om.getDepartment().getName() : null)
                    .position(om.getPosition() != null ? om.getPosition().getName() : null)
                    .build();
        }
    }
}
