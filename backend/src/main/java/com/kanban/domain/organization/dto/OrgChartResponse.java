package com.kanban.domain.organization.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

public class OrgChartResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ChartData {
        private String organizationName;
        private int totalMembers;
        private List<DepartmentNode> departments;
        private List<MemberNode> unassigned;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class DepartmentNode {
        private String id;
        private String name;
        private String description;
        private int displayOrder;
        private String parentDepartmentId;
        private int memberCount;
        private int totalMemberCount;
        private int childDeptCount;
        private LeaderInfo leader;
        private List<DepartmentNode> children;
        private List<MemberNode> members;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class LeaderInfo {
        private String memberId;
        private String userName;
        private String profileImageUrl;
        private String jobTitle;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MemberNode {
        private String id;
        private String userName;
        private String profileImageUrl;
        private String jobTitle;
        private String contractType;
        private String workStatus;
        private String managerId;
        private List<MemberNode> reports;
    }
}
