package com.kanban.domain.integration.confluence.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Confluence Cloud OAuth 2.0 (3LO) 앱 자격증명.
 *
 * <p>JIRA와 <b>같은 Atlassian 앱을 써도 되고 달라도 된다.</b> 도메인이 다른 사이트를 보게 되므로
 * 설정을 분리해 둔다 — 한쪽을 바꿔도 다른 쪽이 깨지지 않는다.
 */
@Configuration
@ConfigurationProperties(prefix = "confluence.oauth")
@Getter
@Setter
public class ConfluenceOAuthProperties {

    private String clientId = "";
    private String clientSecret = "";
    private String redirectUri = "http://localhost:8080/api/v1/confluence/oauth/callback";

    public boolean isConfigured() {
        return clientId != null && !clientId.isBlank()
            && clientSecret != null && !clientSecret.isBlank();
    }
}
