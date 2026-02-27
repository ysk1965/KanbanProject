package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.OrganizationMember;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

public class OrgMemberContributionResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MemberInfo {
        private String id;
        private String userId;
        private String name;
        private String profileImage;
        private String department;
        private String jobGroup;
        private String jobTitle;

        public static MemberInfo of(OrganizationMember member) {
            return MemberInfo.builder()
                    .id(member.getId())
                    .userId(member.getUser().getId())
                    .name(member.getUser().getName())
                    .profileImage(member.getUser().getProfileImage())
                    .department(member.getDepartment() != null ? member.getDepartment().getName() : null)
                    .jobGroup(member.getJobGroup() != null ? member.getJobGroup().getName() : null)
                    .jobTitle(member.getJobTitle())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BoardBreakdown {
        private String boardId;
        private String boardName;
        private long workMinutes;
        private double percentage;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class PrimaryBoard {
        private String id;
        private String name;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MemberContribution {
        private MemberInfo member;
        private long totalWorkMinutes;
        private long previousWorkMinutes;
        private double changePercentage;
        private long completedTasks;
        private long activityCount;
        private PrimaryBoard primaryBoard;
        private List<BoardBreakdown> boardBreakdown;

        public static MemberContribution of(
                OrganizationMember member,
                long totalWorkMinutes,
                long previousWorkMinutes,
                long completedTasks,
                long activityCount,
                PrimaryBoard primaryBoard,
                List<BoardBreakdown> boardBreakdown
        ) {
            double changePercentage = 0.0;
            if (previousWorkMinutes > 0) {
                changePercentage = ((double) (totalWorkMinutes - previousWorkMinutes) / previousWorkMinutes) * 100.0;
            }

            return MemberContribution.builder()
                    .member(MemberInfo.of(member))
                    .totalWorkMinutes(totalWorkMinutes)
                    .previousWorkMinutes(previousWorkMinutes)
                    .changePercentage(changePercentage)
                    .completedTasks(completedTasks)
                    .activityCount(activityCount)
                    .primaryBoard(primaryBoard)
                    .boardBreakdown(boardBreakdown)
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<MemberContribution> members;
        private int totalCount;

        public static ListResponse of(List<MemberContribution> members) {
            return ListResponse.builder()
                    .members(members)
                    .totalCount(members.size())
                    .build();
        }
    }
}
