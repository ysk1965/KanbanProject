package com.kanban.domain.subscription.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "toss.payments")
@Getter
@Setter
public class TossPaymentsConfig {
    private String clientKey;
    private String secretKey;
    private String confirmUrl;
}
