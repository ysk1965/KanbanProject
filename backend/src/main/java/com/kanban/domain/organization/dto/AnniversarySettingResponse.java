package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.OrgAnniversarySetting;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
@AllArgsConstructor
public class AnniversarySettingResponse {
    private String id;
    private Boolean birthdayEnabled;
    private Boolean hireAnniversaryEnabled;
    private String notifyTiming;
    private String dashboardRange;

    public static AnniversarySettingResponse of(OrgAnniversarySetting setting) {
        return AnniversarySettingResponse.builder()
                .id(setting.getId())
                .birthdayEnabled(setting.getBirthdayEnabled())
                .hireAnniversaryEnabled(setting.getHireAnniversaryEnabled())
                .notifyTiming(setting.getNotifyTiming().name())
                .dashboardRange(setting.getDashboardRange().name())
                .build();
    }
}
