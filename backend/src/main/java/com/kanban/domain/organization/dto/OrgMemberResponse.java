package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;

public class OrgMemberResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Simple {
        private String id;
        private UserInfo user;
        private OrgRole role;
        private DepartmentInfo department;
        private JobGroupInfo jobGroup;
        private String jobTitle;
        private ContractType contractType;
        private WorkStatus workStatus;
        private LocalDate hireDate;
        private LocalDateTime joinedAt;

        public static Simple of(OrganizationMember member) {
            return Simple.builder()
                    .id(member.getId())
                    .user(UserInfo.of(member))
                    .role(member.getRole())
                    .department(member.getDepartment() != null ? DepartmentInfo.of(member.getDepartment()) : null)
                    .jobGroup(member.getJobGroup() != null ? JobGroupInfo.of(member.getJobGroup()) : null)
                    .jobTitle(member.getJobTitle())
                    .contractType(member.getContractType())
                    .workStatus(member.getWorkStatus())
                    .hireDate(member.getHireDate())
                    .joinedAt(member.getJoinedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private UserInfo user;
        private OrgRole role;
        private DepartmentInfo department;
        private JobGroupInfo jobGroup;
        private String jobTitle;
        private ContractType contractType;
        private WorkStatus workStatus;
        private String employeeId;
        private String phone;
        private LocalDate birthDate;
        private LocalDate hireDate;
        private String bio;
        private Long tenureMonths;
        private LocalDateTime joinedAt;

        public static Detail of(OrganizationMember member) {
            Long tenure = null;
            if (member.getHireDate() != null) {
                tenure = ChronoUnit.MONTHS.between(member.getHireDate(),
                        LocalDateTime.now(ZoneOffset.UTC).toLocalDate());
            }

            return Detail.builder()
                    .id(member.getId())
                    .user(UserInfo.of(member))
                    .role(member.getRole())
                    .department(member.getDepartment() != null ? DepartmentInfo.of(member.getDepartment()) : null)
                    .jobGroup(member.getJobGroup() != null ? JobGroupInfo.of(member.getJobGroup()) : null)
                    .jobTitle(member.getJobTitle())
                    .contractType(member.getContractType())
                    .workStatus(member.getWorkStatus())
                    .employeeId(member.getEmployeeId())
                    .phone(member.getPhone())
                    .birthDate(member.getBirthDate())
                    .hireDate(member.getHireDate())
                    .bio(member.getBio())
                    .tenureMonths(tenure)
                    .joinedAt(member.getJoinedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class InviteResult {
        private String type; // "direct_add" or "email_sent"
        private Simple member;
        private String email;
        private OrgRole role;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class RemoveResult {
        private RemovedMemberInfo removedMember;
        private List<RemovedBoardInfo> cascadeRemovedFromBoards;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class RemovedMemberInfo {
        private String id;
        private String name;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class RemovedBoardInfo {
        private String boardId;
        private String boardName;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class UserInfo {
        private String id;
        private String name;
        private String email;
        private String profileImage;

        public static UserInfo of(OrganizationMember member) {
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
    public static class DepartmentInfo {
        private String id;
        private String name;

        public static DepartmentInfo of(OrganizationDepartment dept) {
            return DepartmentInfo.builder()
                    .id(dept.getId())
                    .name(dept.getName())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class JobGroupInfo {
        private String id;
        private String name;

        public static JobGroupInfo of(OrganizationJobGroup jobGroup) {
            return JobGroupInfo.builder()
                    .id(jobGroup.getId())
                    .name(jobGroup.getName())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MemberBoard {
        private String id;
        private String name;
        private String description;
        private String ownerName;
        private int memberCount;
        private LocalDateTime createdAt;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class PageResponse {
        private List<Simple> content;
        private long totalElements;
        private int totalPages;
        private int page;
        private int size;
    }
}
