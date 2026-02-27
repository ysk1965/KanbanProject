package com.kanban.domain.organization.dto;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardTier;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class OrgBoardResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Simple {
        private String id;
        private String name;
        private String description;
        private OwnerInfo owner;
        private int memberCount;
        private BoardTier tier;
        private LocalDateTime createdAt;
        private long totalMinutes;
        private long monthlyMinutes;
        private List<MemberPreview> members;
        private List<WeeklyTime> weeklyTimes;

        public static Simple of(Board board, int memberCount,
                                 long totalMinutes, long monthlyMinutes,
                                 List<MemberPreview> members,
                                 List<WeeklyTime> weeklyTimes) {
            return Simple.builder()
                    .id(board.getId())
                    .name(board.getName())
                    .description(board.getDescription())
                    .owner(OwnerInfo.builder()
                            .id(board.getOwner().getId())
                            .name(board.getOwner().getName())
                            .build())
                    .memberCount(memberCount)
                    .tier(board.getTier())
                    .createdAt(board.getCreatedAt())
                    .totalMinutes(totalMinutes)
                    .monthlyMinutes(monthlyMinutes)
                    .members(members)
                    .weeklyTimes(weeklyTimes)
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MemberPreview {
        private String id;
        private String name;
        private String profileImage;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class WeeklyTime {
        private LocalDate weekStart;
        private long minutes;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class OwnerInfo {
        private String id;
        private String name;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class EligibilityCheck {
        private String boardId;
        private String boardName;
        private boolean isEligible;
        private int totalMembers;
        private List<NonOrgMemberInfo> nonOrgMembers;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class NonOrgMemberInfo {
        private String userId;
        private String name;
        private String email;
    }
}
