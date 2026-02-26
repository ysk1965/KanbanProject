package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.OrganizationMember;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.util.List;

public class OrgMemberDetailResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MemberInfo {
        private String id;
        private String name;
        private String profileImage;
        private String department;
        private String jobGroup;
        private String jobTitle;

        public static MemberInfo of(OrganizationMember member) {
            return MemberInfo.builder()
                    .id(member.getId())
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
    public static class TopFeature {
        private String id;
        private String title;
        private long workMinutes;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BoardDetail {
        private String boardId;
        private String boardName;
        private long workMinutes;
        private long completedTasks;
        private List<TopFeature> topFeatures;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class WeeklyTrend {
        private LocalDate weekStart;
        private long workMinutes;
        private long completedTasks;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private MemberInfo member;
        private long totalWorkMinutes;
        private long completedTasks;
        private long activityCount;
        private List<BoardDetail> boardDetails;
        private List<WeeklyTrend> weeklyTrend;

        public static Detail of(
                OrganizationMember member,
                long totalWorkMinutes,
                long completedTasks,
                long activityCount,
                List<BoardDetail> boardDetails,
                List<WeeklyTrend> weeklyTrend
        ) {
            return Detail.builder()
                    .member(MemberInfo.of(member))
                    .totalWorkMinutes(totalWorkMinutes)
                    .completedTasks(completedTasks)
                    .activityCount(activityCount)
                    .boardDetails(boardDetails)
                    .weeklyTrend(weeklyTrend)
                    .build();
        }
    }
}
