package com.kanban.domain.jobrole.dto;

import com.kanban.domain.jobrole.entity.JobRole;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.io.Serial;
import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

public class JobRoleResponse {

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Detail implements Serializable {
        @Serial
        private static final long serialVersionUID = 1L;

        private String id;
        private String name;
        private String color;
        private String icon;
        private Integer displayOrder;
        private Long memberCount;
        private LocalDateTime createdAt;

        public static Detail of(JobRole role) {
            return Detail.builder()
                    .id(role.getId())
                    .name(role.getName())
                    .color(role.getColor())
                    .icon(role.getIcon())
                    .displayOrder(role.getDisplayOrder())
                    .createdAt(role.getCreatedAt())
                    .build();
        }

        public static Detail of(JobRole role, Long memberCount) {
            return Detail.builder()
                    .id(role.getId())
                    .name(role.getName())
                    .color(role.getColor())
                    .icon(role.getIcon())
                    .displayOrder(role.getDisplayOrder())
                    .memberCount(memberCount)
                    .createdAt(role.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<Detail> jobRoles;

        public static ListResponse of(List<Detail> details) {
            return ListResponse.builder().jobRoles(details).build();
        }
    }

    /**
     * BoardMember/AssigneeInfo 등 다른 응답에 임베드되는 경량 DTO
     */
    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class JobRoleInfo implements Serializable {
        @Serial
        private static final long serialVersionUID = 1L;

        private String id;
        private String name;
        private String color;
        private String icon;

        public static JobRoleInfo of(JobRole role) {
            if (role == null) return null;
            return JobRoleInfo.builder()
                    .id(role.getId())
                    .name(role.getName())
                    .color(role.getColor())
                    .icon(role.getIcon())
                    .build();
        }
    }
}
