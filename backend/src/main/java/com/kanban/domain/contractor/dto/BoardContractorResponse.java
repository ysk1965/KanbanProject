package com.kanban.domain.contractor.dto;

import com.kanban.domain.contractor.entity.BoardContractor;
import com.kanban.domain.contractor.entity.BoardContractorPeriod;
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

    /** 계약 기간 한 건. */
    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PeriodInfo implements Serializable {
        @Serial
        private static final long serialVersionUID = 1L;

        private String id;
        private LocalDate startDate;
        private LocalDate endDate;

        public static PeriodInfo of(BoardContractorPeriod p) {
            return PeriodInfo.builder()
                    .id(p.getId())
                    .startDate(p.getStartDate())
                    .endDate(p.getEndDate())
                    .build();
        }
    }

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
        /** 워크로드 뷰 숨김 여부. */
        private Boolean hidden;
        /** 대표(현재) 기간 — 하위호환 표시용. periods 에서 파생. */
        private LocalDate startDate;
        private LocalDate endDate;
        /** 전체 계약 기간 이력 (start_date ASC). */
        private List<PeriodInfo> periods;
        /** 파생 상태: active / upcoming / expired / none. */
        private String status;

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
            BoardContractorPeriod current = c.getCurrentPeriod();
            List<PeriodInfo> periods = c.getPeriods() == null ? List.of()
                    : c.getPeriods().stream().map(PeriodInfo::of).toList();
            return Detail.builder()
                    .id(c.getId())
                    .name(c.getName())
                    .color(c.getColor())
                    .displayOrder(c.getDisplayOrder())
                    .hidden(c.getHidden())
                    .startDate(current != null ? current.getStartDate() : null)
                    .endDate(current != null ? current.getEndDate() : null)
                    .periods(periods)
                    .status(c.getDerivedStatus())
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
            BoardContractorPeriod current = c.getCurrentPeriod();
            return ContractorInfo.builder()
                    .id(c.getId())
                    .name(c.getName())
                    .color(c.getColor())
                    .startDate(current != null ? current.getStartDate() : null)
                    .endDate(current != null ? current.getEndDate() : null)
                    .managerMemberId(managerMemberId)
                    .managerName(managerName)
                    .jobRole(JobRoleResponse.JobRoleInfo.of(c.getJobRole()))
                    .build();
        }
    }
}
