package com.kanban.domain.organization.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class AnniversarySettingRequest {
    private Boolean birthdayEnabled;
    private Boolean hireAnniversaryEnabled;
    private String notifyTiming;
    private String dashboardRange;
}
