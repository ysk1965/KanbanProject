package com.kanban.domain.personal.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@Builder
@AllArgsConstructor
public class CelebrationsResponse {

    private List<CelebrationItem> celebrations;

    @Getter
    @Builder
    @AllArgsConstructor
    public static class CelebrationItem {
        private String orgId;
        private String orgName;
        private String memberUserId;
        private String memberName;
        private String memberProfileImage;
        private String type; // BIRTHDAY, HIRE_ANNIVERSARY
        private String messageTemplate;
        private boolean canSendMessage;
        private boolean alreadySent;
    }
}
