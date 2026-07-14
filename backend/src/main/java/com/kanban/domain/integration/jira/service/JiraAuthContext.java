package com.kanban.domain.integration.jira.service;

import com.kanban.domain.integration.jira.JiraAuthType;
import com.kanban.domain.integration.jira.JiraIntegrationConfig;

/**
 * JIRA 호출 인증 컨텍스트. 인증 방식에 따라 base URL과 헤더가 갈린다.
 * - API_TOKEN: https://{baseUrl}/rest/api/3 + Basic(email:token)
 * - OAUTH_3LO: https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3 + Bearer(token)
 */
public record JiraAuthContext(
    JiraAuthType authType,
    String baseUrl,
    String cloudId,
    String email,
    String token
) {
    public static JiraAuthContext of(JiraIntegrationConfig config, String token) {
        return new JiraAuthContext(
            config.getAuthType(), config.getBaseUrl(), config.getCloudId(), config.getAccountEmail(), token);
    }

    public static JiraAuthContext basic(String baseUrl, String email, String token) {
        return new JiraAuthContext(JiraAuthType.API_TOKEN, baseUrl, null, email, token);
    }

    public static JiraAuthContext oauth(String cloudId, String token) {
        return new JiraAuthContext(JiraAuthType.OAUTH_3LO, null, cloudId, null, token);
    }

    public boolean isOAuth() {
        return authType == JiraAuthType.OAUTH_3LO;
    }
}
