package com.kanban.domain.test;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
@AllArgsConstructor
public class TestOrgDataResponse {
    private String organizationId;
    private String organizationName;
    private int memberCount;
    private int departmentCount;
    private int leavePolicyCount;
    private int leaveRequestCount;
    private int onboardingTemplateCount;
    private int attendanceRecordCount;
    private int announcementCount;
    private int activityCount;
    private int okrCycleCount;
    private int okrObjectiveCount;
    private int okrKeyResultCount;
    private String message;
}
