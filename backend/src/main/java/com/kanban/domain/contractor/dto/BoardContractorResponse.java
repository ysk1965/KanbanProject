package com.kanban.domain.contractor.dto;

import com.kanban.domain.contractor.entity.BoardContractor;
import com.kanban.domain.jobrole.dto.JobRoleResponse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.io.Serial;
import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class BoardContractorResponse {

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
        private Integer displayOrder;
        private LocalDate startDate;
        private LocalDate endDate;

        private String managerMemberId;
        private String managerName;
        private String managerUserId;

        private JobRoleResponse.JobRoleInfo jobRole;

        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(BoardContractor c) {
            String managerMemberId = c.getManager() != null ? c.getManager().getId() : null;
            String managerName = null;
            String managerUserId = null;
            if (c.getManager() != null && c.getManager().getUser() != null) {
                managerName = c.getManager().getUser().getName();
                managerUserId = c.getManager().getUser().getId();
            }
            return Detail.builder()
                    .id(c.getId())
                    .name(c.getName())
                    .color(c.getColor())
                    .displayOrder(c.getDisplayOrder())
                    .startDate(c.getStartDate())
                    .endDate(c.getEndDate())
                    .managerMemberId(managerMemberId)
                    .managerName(managerName)
                    .managerUserId(managerUserId)
                    .jobRole(JobRoleResponse.JobRoleInfo.of(c.getJobRole()))
                    .createdAt(c.getCreatedAt())
                    .updatedAt(c.getUpdatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<Detail> contractors;

        public static ListResponse of(List<Detail> details) {
            return ListResponse.builder().contractors(details).build();
        }
    }

    /**
     * 다른 응답에 임베드되는 경량 DTO (assignee 응답 등).
     */
    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ContractorInfo implements Serializable {
        @Serial
        private static final long serialVersionUID = 1L;

        private String id;
        private String name;
        private String color;
        private LocalDate startDate;
        private LocalDate endDate;
        private String managerMemberId;
        private String managerName;
        private JobRoleResponse.JobRoleInfo jobRole;

        public static ContractorInfo of(BoardContractor c) {
            if (c == null) return null;
            String managerMemberId = c.getManager() != null ? c.getManager().getId() : null;
            String managerName = null;
            if (c.getManager() != null && c.getManager().getUser() != null) {
                managerName = c.getManager().getUser().getName();
            }
            return ContractorInfo.builder()
                    .id(c.getId())
                    .name(c.getName())
                    .color(c.getColor())
                    .startDate(c.getStartDate())
                    .endDate(c.getEndDate())
                    .managerMemberId(managerMemberId)
                    .managerName(managerName)
                    .jobRole(JobRoleResponse.JobRoleInfo.of(c.getJobRole()))
                    .build();
        }
    }
}
