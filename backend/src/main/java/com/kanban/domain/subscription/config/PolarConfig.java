package com.kanban.domain.subscription.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "polar")
@Getter
@Setter
public class PolarConfig {

    private String apiKey;
    private String webhookSecret;
    private String organizationId;
    private String baseUrl;
    private Products products = new Products();

    @Getter
    @Setter
    public static class Products {
        private String boardMonthly;
        private String boardYearly;
        private String orgMonthly;
        private String orgYearly;
        private String credit100;
        private String credit500;
        private String credit1000;
    }
}
