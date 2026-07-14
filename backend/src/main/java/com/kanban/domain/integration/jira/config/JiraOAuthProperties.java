package com.kanban.domain.integration.jira.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * JIRA OAuth 2.0 (3LO) 앱 자격증명. developer.atlassian.com에 등록한 앱 값.
 * SlackAppConfig 패턴과 동일하게 @ConfigurationProperties 바인딩.
 */
@Configuration
@ConfigurationProperties(prefix = "jira.oauth")
@Getter
@Setter
public class JiraOAuthProperties {
    private String clientId = "";
    private String clientSecret = "";
    private String redirectUri = "http://localhost:8080/api/v1/jira/oauth/callback";

    public boolean isConfigured() {
        return clientId != null && !clientId.isBlank()
            && clientSecret != null && !clientSecret.isBlank();
    }
}
