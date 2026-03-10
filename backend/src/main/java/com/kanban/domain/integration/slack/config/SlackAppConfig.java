package com.kanban.domain.integration.slack.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "slack.app")
@Getter
@Setter
public class SlackAppConfig {
    private String clientId;
    private String clientSecret;
    private String signingSecret;
    private String tokenEncryptionKey;
    private String botScopes = "chat:write,channels:read,groups:read,commands,reactions:read,im:write";
    private String userScopes = "identity.basic,identity.email";
    private String redirectUri = "http://localhost:8080/api/v1/slack/oauth/callback";
    private String userRedirectUri = "http://localhost:8080/api/v1/slack/oauth/user-callback";
}
