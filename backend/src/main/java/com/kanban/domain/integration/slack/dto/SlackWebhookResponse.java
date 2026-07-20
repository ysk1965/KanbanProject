package com.kanban.domain.integration.slack.dto;

import com.kanban.domain.integration.slack.MemberSlackWebhook;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

public class SlackWebhookResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String boardId;
        private String webhookUrlMasked;
        private String channelName;
        private boolean enabled;
        private String createdAt;
        private String updatedAt;

        public static Detail of(MemberSlackWebhook webhook) {
            return Detail.builder()
                    .id(webhook.getId())
                    .boardId(webhook.getBoard().getId())
                    .webhookUrlMasked(maskWebhookUrl(webhook.getWebhookUrl()))
                    .channelName(webhook.getChannelName())
                    .enabled(webhook.getEnabled())
                    .createdAt(webhook.getCreatedAt() != null ? webhook.getCreatedAt() + "Z" : null)
                    .updatedAt(webhook.getUpdatedAt() != null ? webhook.getUpdatedAt() + "Z" : null)
                    .build();
        }

        private static String maskWebhookUrl(String url) {
            if (url == null || !url.contains("/services/")) {
                return "https://hooks.slack.com/services/***";
            }
            String servicesPart = url.substring(url.indexOf("/services/") + "/services/".length());
            String[] parts = servicesPart.split("/");
            if (parts.length >= 3) {
                String lastPart = parts[2];
                String lastFour = lastPart.length() > 4 ? lastPart.substring(lastPart.length() - 4) : lastPart;
                return "https://hooks.slack.com/services/" + parts[0].substring(0, Math.min(2, parts[0].length())) + "***/"
                        + parts[1].substring(0, Math.min(2, parts[1].length())) + "***/****" + lastFour;
            }
            return "https://hooks.slack.com/services/***";
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TestResult {
        private boolean success;
        private String message;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MemberStatus {
        private String userId;
        private boolean connected;      // 개인 웹훅 행 존재 여부 (레거시 호환)
        private boolean enabled;        // 개인 웹훅 enabled (레거시 호환)
        private String channelName;
        private boolean accountLinked;  // Slack 계정 연동(SlackUserLink) 여부 → 봇 DM 수신 가능
        private boolean botInstalled;   // 이 보드에 Slack 앱(SlackInstallation) 설치 여부
        private boolean reachable;      // 실제로 Slack 알림을 받는 상태 (봇 DM 또는 웹훅)

        public static MemberStatus of(MemberSlackWebhook webhook) {
            return MemberStatus.builder()
                    .userId(webhook.getUser().getId())
                    .connected(true)
                    .enabled(webhook.getEnabled())
                    .channelName(webhook.getChannelName())
                    .build();
        }
    }
}
