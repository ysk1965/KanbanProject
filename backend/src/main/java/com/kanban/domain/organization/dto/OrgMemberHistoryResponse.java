package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.OrgMemberHistory;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

public class OrgMemberHistoryResponse {

    @Getter
    @Builder
    public static class Item {
        private String id;
        private String departmentId;
        private String departmentName;
        private String positionId;
        private String positionName;
        private String titleId;
        private String titleName;
        private String gradeId;
        private String gradeName;
        private String jobGroupId;
        private String jobGroupName;
        private String jobTitle;
        private LocalDate effectiveStartDate;
        private LocalDate effectiveEndDate;
        private Long durationMonths;
        private String description;
        private String source;
        private String createdById;
        private LocalDateTime createdAt;

        public static Item of(OrgMemberHistory h) {
            LocalDate end = h.getEffectiveEndDate() != null
                    ? h.getEffectiveEndDate()
                    : LocalDate.now(ZoneOffset.UTC);
            long months = ChronoUnit.MONTHS.between(h.getEffectiveStartDate(), end);

            return Item.builder()
                    .id(h.getId())
                    .departmentId(h.getDepartmentId())
                    .departmentName(h.getDepartmentName())
                    .positionId(h.getPositionId())
                    .positionName(h.getPositionName())
                    .titleId(h.getTitleId())
                    .titleName(h.getTitleName())
                    .gradeId(h.getGradeId())
                    .gradeName(h.getGradeName())
                    .jobGroupId(h.getJobGroupId())
                    .jobGroupName(h.getJobGroupName())
                    .jobTitle(h.getJobTitle())
                    .effectiveStartDate(h.getEffectiveStartDate())
                    .effectiveEndDate(h.getEffectiveEndDate())
                    .durationMonths(months)
                    .description(h.getDescription())
                    .source(h.getSource())
                    .createdById(h.getCreatedById())
                    .createdAt(h.getCreatedAt())
                    .build();
        }
    }
}
