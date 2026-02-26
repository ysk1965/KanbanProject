package com.kanban.domain.organization.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

public class OrgMemberHistoryRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        private LocalDate effectiveStartDate;
        private String departmentId;
        private String positionId;
        private String titleId;
        private String gradeId;
        private String jobGroupId;
        private String jobTitle;
        private String description;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateDescription {
        private String description;
    }
}
